"""Deterministic text / speech metrics so numbers never depend on the LLM."""
from __future__ import annotations

import re
from typing import Optional

_WORD = re.compile(r"[A-Za-z0-9'’\-]+")
_SENT = re.compile(r"[.!?]+(?:\s|$)")
_VOWEL_GROUP = re.compile(r"[aeiouy]+", re.IGNORECASE)

# multi-word fillers are matched on the normalised transcript
SINGLE_FILLERS = ["um", "uh", "er", "erm", "ah", "hmm", "like", "basically", "actually", "literally", "honestly", "right"]
PHRASE_FILLERS = ["you know", "i mean", "sort of", "kind of"]
# "like" / "right" / "actually" are ambiguous; only count the unambiguous ones strictly
STRICT = {"um", "uh", "er", "erm", "ah", "hmm", "basically", "literally", "honestly"}


def strip_markdown(text: str) -> str:
    text = re.sub(r"```.*?```", " ", text, flags=re.S)
    text = re.sub(r"`[^`]*`", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"^[#>\-\*\+\d\.\s]+(?=\S)", "", text, flags=re.M)
    text = re.sub(r"[*_~]", "", text)
    return text


def word_count(text: str, markdown: bool = True) -> int:
    t = strip_markdown(text) if markdown else text
    return len(_WORD.findall(t))


def count_syllables(word: str) -> int:
    w = re.sub(r"[^a-z]", "", word.lower())
    if not w:
        return 0
    n = len(_VOWEL_GROUP.findall(w))
    if w.endswith("e") and not w.endswith(("le", "ee")) and n > 1:
        n -= 1
    return max(1, n)


def readability(text: str) -> tuple[Optional[float], Optional[float]]:
    """Return (Flesch-Kincaid grade, Flesch reading ease) or (None, None) if too short."""
    t = strip_markdown(text)
    words = _WORD.findall(t)
    if len(words) < 10:
        return None, None
    sentences = max(1, len(_SENT.findall(t)))
    syll = sum(count_syllables(w) for w in words)
    wps = len(words) / sentences
    spw = syll / len(words)
    grade = 0.39 * wps + 11.8 * spw - 15.59
    ease = 206.835 - 1.015 * wps - 84.6 * spw
    return round(max(0.0, grade), 1), round(max(0.0, min(120.0, ease)), 1)


def wpm(words: int, seconds: float) -> int:
    if seconds <= 0:
        return 0
    return int(round(words / (seconds / 60.0)))


def filler_counts(transcript: str) -> list[tuple[str, int]]:
    """Count filler words/phrases in a transcript. Returns [(word, count)] sorted desc."""
    t = " " + re.sub(r"[^a-z' ]", " ", transcript.lower()) + " "
    t = re.sub(r"\s+", " ", t)
    out: dict[str, int] = {}
    for p in PHRASE_FILLERS:
        c = len(re.findall(rf"(?<= ){re.escape(p)}(?= )", t))
        if c:
            out[p] = c
    for w in STRICT:
        c = len(re.findall(rf"(?<= ){re.escape(w)}(?= )", t))
        if c:
            out[w] = c
    return sorted(out.items(), key=lambda kv: (-kv[1], kv[0]))
