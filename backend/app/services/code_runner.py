"""Sandboxed code execution for CODE blocks.

SECURITY NOTE
-------------
This runs user-submitted code in a child process with CPU / memory / file-size
limits, a scrubbed environment, a private temp directory, its own process group
and a hard wall-clock timeout. That stops infinite loops and runaway memory but
it is **not** a hardened security boundary. For multi-tenant / public deployments
run the backend inside the provided Docker container (or a gVisor/Firecracker
sandbox) and keep the container network-isolated from your database.
"""
from __future__ import annotations

import asyncio
import json
import os
import secrets
import shutil
import signal
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from app.core.config import get_settings
from app.models.schemas import RunOut, RuntimeInfo, TestResult
from app.models.task import TestCase

MAX_OUTPUT = 32_000
_SEM = asyncio.Semaphore(4)


@dataclass(frozen=True)
class Lang:
    key: str
    label: str
    monaco: str
    ext: str
    binaries: tuple[str, ...]           # any of these on PATH => available
    supports_tests: bool = False
    limit_memory: bool = True           # RLIMIT_AS breaks V8 / Go runtimes


LANGS: dict[str, Lang] = {
    "python": Lang("python", "Python 3", "python", "py", ("python3",), True),
    "javascript": Lang("javascript", "JavaScript (Node)", "javascript", "js", ("node",), True, False),
    "typescript": Lang("typescript", "TypeScript (Node)", "typescript", "ts", ("node",), False, False),
    "cpp": Lang("cpp", "C++ 20", "cpp", "cpp", ("g++",), False),
    "go": Lang("go", "Go", "go", "go", ("go",), False, False),
    "rust": Lang("rust", "Rust", "rust", "rs", ("rustc",), False),
    "sql": Lang("sql", "SQL (SQLite)", "sql", "sql", ("python3",), False),
}
ALIASES = {"py": "python", "python3": "python", "js": "javascript", "node": "javascript", "ts": "typescript",
           "c++": "cpp", "cxx": "cpp", "golang": "go", "rs": "rust"}


def normalise_language(lang: Optional[str]) -> str:
    k = (lang or "python").strip().lower()
    k = ALIASES.get(k, k)
    return k if k in LANGS else "python"


def list_runtimes() -> list[RuntimeInfo]:
    s = get_settings()
    out = []
    for l in LANGS.values():
        avail = s.code_runner_enabled and any(shutil.which(b) for b in l.binaries)
        out.append(RuntimeInfo(key=l.key, label=l.label, available=avail, supports_tests=l.supports_tests, monaco=l.monaco))
    return out


def _trim(b: bytes) -> str:
    s = b.decode("utf-8", errors="replace")
    if len(s) > MAX_OUTPUT:
        s = s[:MAX_OUTPUT] + "\n…[output truncated]"
    return s


def _limits(mem_mb: int, cpu_s: int, limit_mem: bool):
    def _apply() -> None:  # runs in the child between fork and exec
        import resource

        os.setsid()
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s + 1))
        resource.setrlimit(resource.RLIMIT_FSIZE, (10 * 1024 * 1024, 10 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
        if limit_mem:
            b = mem_mb * 1024 * 1024
            resource.setrlimit(resource.RLIMIT_AS, (b, b))

    return _apply


def _py_harness(token: str) -> str:
    return f'''
import ast, json, sys
_ns = {{"__name__": "__agama_user__"}}
_src = open("solution.py", encoding="utf-8").read()
exec(compile(_src, "solution.py", "exec"), _ns)
_tests = json.load(open("tests.json", encoding="utf-8"))
_res = []
for _t in _tests:
    _r = {{"name": _t["name"], "call": _t["call"], "expected": _t["expected"], "passed": False, "actual": None, "error": None}}
    try:
        _actual = eval(_t["call"], _ns)
        try:
            _exp = ast.literal_eval(_t["expected"])
        except Exception:
            _exp = eval(_t["expected"], _ns)
        _r["actual"] = repr(_actual)[:500]
        _r["passed"] = (_actual == _exp)
    except BaseException as _e:
        _r["error"] = (type(_e).__name__ + ": " + str(_e))[:500]
    _res.append(_r)
sys.stdout.flush()
print("\\n{token}" + json.dumps(_res))
'''


_SQL_HARNESS = '''
import sqlite3
con = sqlite3.connect(":memory:")
src = open("solution.sql", encoding="utf-8").read()
buf, shown = "", 0
def show(cur):
    global shown
    cols = [d[0] for d in cur.description]
    rows = cur.fetchmany(200)
    w = [max(len(str(c)), *(len(str(r[i])) for r in rows)) if rows else len(str(c)) for i, c in enumerate(cols)]
    print(" | ".join(str(c).ljust(w[i]) for i, c in enumerate(cols)))
    print("-+-".join("-" * x for x in w))
    for r in rows:
        print(" | ".join(str(v).ljust(w[i]) for i, v in enumerate(r)))
    print("(%d row%s)\\n" % (len(rows), "" if len(rows) == 1 else "s"))
    shown += 1
for line in src.splitlines(keepends=True):
    buf += line
    if sqlite3.complete_statement(buf):
        cur = con.execute(buf)
        if cur.description:
            show(cur)
        buf = ""
if buf.strip() and not all(l.strip().startswith("--") or not l.strip() for l in buf.splitlines()):
    cur = con.execute(buf)
    if cur.description:
        show(cur)
if not shown:
    print("Statements ran OK, but no query returned rows. End with a SELECT to see a result.")
'''


def _js_harness(token: str) -> str:
    return f'''
const fs = require("fs"), vm = require("vm"), util = require("util");
const ctx = vm.createContext({{ console, require, process, setTimeout, setInterval, clearTimeout, clearInterval }});
const src = fs.readFileSync("solution.js", "utf8");
vm.runInContext(src, ctx, {{ filename: "solution.js" }});
const tests = JSON.parse(fs.readFileSync("tests.json", "utf8"));
const res = [];
for (const t of tests) {{
  const r = {{ name: t.name, call: t.call, expected: t.expected, passed: false, actual: null, error: null }};
  try {{
    const actual = vm.runInContext(t.call, ctx);
    const exp = vm.runInContext("(" + t.expected + ")", ctx);
    r.actual = util.inspect(actual, {{ depth: 4, breakLength: Infinity }}).slice(0, 500);
    r.passed = util.isDeepStrictEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(exp)));
  }} catch (e) {{ r.error = String(e && e.stack ? e.message : e).slice(0, 500); }}
  res.push(r);
}}
console.log("\\n{token}" + JSON.stringify(res));
'''


async def _exec(argv: list[str], cwd: str, stdin: str, timeout: float, lang: Lang) -> tuple[int | None, bytes, bytes, bool]:
    s = get_settings()
    env = {"PATH": os.environ.get("PATH", "/usr/bin:/bin"), "HOME": cwd, "LANG": "C.UTF-8", "TMPDIR": cwd,
           "PYTHONDONTWRITEBYTECODE": "1", "PYTHONIOENCODING": "utf-8"}
    if lang.key == "go":
        env["GOCACHE"] = os.path.join(cwd, ".gocache")
        env["GOPATH"] = os.path.join(cwd, ".gopath")
        env["GOFLAGS"] = "-mod=mod"
    proc = await asyncio.create_subprocess_exec(
        *argv,
        cwd=cwd,
        env=env,
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        preexec_fn=_limits(s.code_run_memory_mb, int(timeout) + 1, lang.limit_memory),
    )
    timed_out = False
    try:
        out, err = await asyncio.wait_for(proc.communicate(stdin.encode()), timeout=timeout)
    except asyncio.TimeoutError:
        timed_out = True
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except (ProcessLookupError, PermissionError):
            proc.kill()
        out, err = await proc.communicate()
    return proc.returncode, out, err, timed_out


async def run_code(code: str, language: Optional[str], stdin: str = "", tests: Optional[list[TestCase]] = None) -> RunOut:
    s = get_settings()
    key = normalise_language(language)
    lang = LANGS[key]
    if not s.code_runner_enabled:
        return RunOut(language=key, stdout="", stderr="Code runner is disabled on this server.", exit_code=None,
                      timed_out=False, duration_ms=0)
    if not any(shutil.which(b) for b in lang.binaries):
        return RunOut(language=key, stdout="", stderr=f"{lang.label} is not installed on the server.", exit_code=None,
                      timed_out=False, duration_ms=0)

    run_tests = bool(tests) and lang.supports_tests
    timeout = s.code_run_timeout_seconds
    token = "__AGAMA_TESTS_" + secrets.token_hex(8) + "__"
    t0 = time.perf_counter()

    async with _SEM:
        with tempfile.TemporaryDirectory(prefix="agama_run_") as d:
            work = Path(d)
            src_name = f"solution.{lang.ext}" if key not in ("go",) else "main.go"
            (work / src_name).write_text(code, encoding="utf-8")
            if run_tests:
                (work / "tests.json").write_text(
                    json.dumps([{"name": t.name or f"Test {i + 1}", "call": t.call, "expected": t.expected}
                                for i, t in enumerate(tests or [])]),
                    encoding="utf-8",
                )

            # ---- build / argv ----
            compile_err = ""
            if key == "python":
                if run_tests:
                    (work / "_harness.py").write_text(_py_harness(token), encoding="utf-8")
                    argv = [shutil.which("python3") or sys.executable, "-I", "_harness.py"]
                else:
                    argv = [shutil.which("python3") or sys.executable, "-I", src_name]
            elif key == "javascript":
                if run_tests:
                    (work / "_harness.js").write_text(_js_harness(token), encoding="utf-8")
                    argv = ["node", "_harness.js"]
                else:
                    argv = ["node", src_name]
            elif key == "sql":
                (work / "_harness.py").write_text(_SQL_HARNESS, encoding="utf-8")
                argv = [shutil.which("python3") or sys.executable, "-I", "_harness.py"]
            elif key == "typescript":
                argv = ["node", "--experimental-strip-types", "--no-warnings", src_name]
            elif key == "go":
                (work / "go.mod").write_text("module agama\n\ngo 1.21\n", encoding="utf-8")
                argv = ["go", "run", "."]
            else:  # compiled: cpp / rust
                exe = str(work / "prog")
                cmd = ["g++", "-std=c++20", "-O1", "-o", exe, src_name] if key == "cpp" else ["rustc", "-O", "-o", exe, src_name]
                rc, o, e, to = await _exec(cmd, d, "", 40.0, Lang(**{**lang.__dict__, "limit_memory": False}))
                if rc != 0 or to:
                    return RunOut(language=key, stdout="", stderr=_trim(e or o) or "Compilation failed or timed out.",
                                  exit_code=rc, timed_out=to, duration_ms=int((time.perf_counter() - t0) * 1000))
                argv = [exe]
                compile_err = _trim(e)

            rc, out, err, timed_out = await _exec(argv, d, stdin, timeout, lang)

    stdout = out.decode("utf-8", errors="replace")
    results: list[TestResult] = []
    if run_tests and token in stdout:
        head, _, tail = stdout.partition(token)
        stdout = head.rstrip("\n")
        try:
            for r in json.loads(tail.strip().splitlines()[0]):
                results.append(TestResult(**r))
        except (ValueError, KeyError, IndexError):
            pass
    if len(stdout) > MAX_OUTPUT:
        stdout = stdout[:MAX_OUTPUT] + "\n…[output truncated]"
    stderr = _trim(err)
    if timed_out:
        stderr = (stderr + f"\n⏱ Time limit exceeded ({timeout:g}s). Possible infinite loop.").strip()
    elif rc is not None and rc < 0:
        sig = -rc
        stderr = (stderr + f"\nProcess killed by signal {sig}"
                  + (" (memory/CPU limit)" if sig in (signal.SIGKILL, signal.SIGXCPU, signal.SIGSEGV, signal.SIGABRT) else "")).strip()

    # If the harness itself crashed before reporting (syntax error, sys.exit…), mark every test failed.
    if run_tests and not results:
        reason = (stderr.strip().splitlines() or ["Program did not finish"])[-1][:300]
        results = [TestResult(name=t.name or f"Test {i + 1}", call=t.call, expected=t.expected, passed=False, error=reason)
                   for i, t in enumerate(tests or [])]

    return RunOut(
        language=key,
        stdout=stdout,
        stderr=(compile_err + ("\n" if compile_err and stderr else "") + stderr).strip(),
        exit_code=rc,
        timed_out=timed_out,
        duration_ms=int((time.perf_counter() - t0) * 1000),
        tests=results,
        tests_passed=sum(1 for r in results if r.passed),
        tests_total=len(results),
    )
