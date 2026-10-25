"""Sample data for the "Quick Demo" sandbox account (clearly synthetic).

Every day the demo account is re-seeded so "today" always has a realistic schedule
and the analytics screens have ~8 weeks of history to draw.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import random
import secrets

from app.core.security import hash_password
from app.models.enums import TaskMode, TaskStatus
from app.models.flashcard import Flashcard
from app.models.journal import (
    CodeMetrics, FillerCount, Insight, JournalEntry, ProseMetrics, SpeechMetrics, TheoryMetrics,
)
from app.models.task import TaskBlock, TestCase
from app.models.user import User

DEMO_EMAIL = "demo@agama.local"

CODE_TOPICS = ["Sliding Window & Monotonic Deque", "Two Pointers & Binary Search", "Dynamic Programming & Memoization", "Graphs & Traversal"]
SAMPLE_CODE = '''from collections import deque

def max_sliding_window(nums, k):
    q, out = deque(), []
    for i, v in enumerate(nums):
        while q and nums[q[-1]] <= v:
            q.pop()
        q.append(i)
        if q[0] <= i - k:
            q.popleft()
        if i >= k - 1:
            out.append(nums[q[0]])
    return out
'''
SAMPLE_PROSE = ("The silence came first, not the sirens. In datacenter pods, true disasters do not screech; they shed throughput "
                "in smooth, exponential declines that deceive the unwary. At 03:14:02 UTC the leader lost its quorum and stepped down.")
SAMPLE_NOTES = "## Raft key insights\n- Heartbeat 50-100ms\n- Election timeout 150-300ms, uniformly random\n- Only the most up-to-date log can win an election"
SAMPLE_TRANSCRIPT = ("Good morning panel. Today we eliminate eighty five percent of tail latency in our distributed state machine. "
                     "The bottleneck was the memcpy boundary between kernel page buffers and userland. Our design anchors the log "
                     "segment with io_uring and uses zero copy deserialization, so readers consume raw bytes with constant time pointer arithmetic.")


def _insights(kind_pairs: list[tuple[str, str, str]]) -> list[Insight]:
    return [Insight(kind=k, title=t, detail=d) for k, t, d in kind_pairs]


def _metrics(mode: TaskMode, score: int, rng: random.Random, minutes: float):
    if mode == TaskMode.CODE:
        passed = score >= 70
        return CodeMetrics(
            score=score, verdict="Algorithmic Contract Passed" if passed else "Partially Correct",
            logic_status="PASS" if passed else "PARTIAL", time_complexity="O(n)" if score >= 80 else "O(n²)",
            space_complexity="O(k)", target_time_complexity="O(n)", target_space_complexity="O(k)",
            tests_passed=6 if passed else 4, tests_total=6,
            feedback_bullets=["Boundary eviction is correct", "Inner loop is amortised O(1)", "Consider naming the deque `window`"],
            insights=_insights([("strength", "Boundary Invariants Respected", "The window eviction at i − k + 1 is applied before reading the maximum."),
                                ("warning" if score < 85 else "tip", "Inspection Cost Advisory", "Avoid list(q) inside the hot loop; it makes each step O(k).")]),
            takeaway="A monotonic deque must preserve decreasing order of values; evict stale indices from the front in O(1).",
        )
    if mode == TaskMode.PROSE:
        wc = rng.randint(480, 760)
        return ProseMetrics(
            score=score, verdict="Narrative Contract Passed", tone="Conversational SRE", pacing="Strong", voice_texture="Cinematic Rigor",
            word_count=wc, readability_grade=round(rng.uniform(9, 13), 1), flesch_reading_ease=round(rng.uniform(40, 62), 1),
            technical_accuracy=min(100, score + 4), narrative_pacing=max(0, score - 3), word_target_min=600, word_target_max=800,
            feedback_bullets=["Sensory anchors ground the technical scene", "Section 2 leans on passive voice"],
            insights=_insights([("strength", "Show, Don't Tell Mastery", "Sensory detail makes the failure feel real."),
                                ("warning", "Passive Voice in Failure Transition", "Use active verbs for the engineers' decisions.")]),
            takeaway="Before: 'The network was partitioned.' After: 'The Atlantic swallowed the link and Node A went deaf.'",
        )
    if mode == TaskMode.THEORY:
        return TheoryMetrics(
            score=score, comprehension_score=score, verdict="Comprehension Contract Met",
            captured_concepts=["Randomised election timeouts", "Log matching property"], missed_concepts=["Joint consensus overlap", "Snapshot compaction boundaries"],
            next_review_days=4, feedback_bullets=["Strong grasp of leader election", "Review membership changes"],
            insights=_insights([("strength", "Election Safety", "Quorum bounds and randomised timers were synthesised accurately."),
                                ("warning", "Joint Consensus Gap", "Describe the double-majority requirement in C(old,new).")]),
            takeaway="During C(old,new) decisions need a majority of the old AND the new configuration.",
        )
    wpm = rng.randint(125, 150)
    return SpeechMetrics(
        score=score, verdict="Fluency & Delivery Passed", wpm=wpm, target_wpm=135, filler_words=[FillerCount(word="basically", count=2), FillerCount(word="um", count=1)],
        filler_total=3, fluency_score=score, clarity_score=min(100, score + 5), fluency_grade="A-" if score >= 88 else "B+",
        speaking_ratio=0.84, duration_seconds=int(minutes * 60),
        feedback_bullets=["Confident, hedge-free answers", "Slow down on technical jargon"],
        insights=_insights([("strength", "Confidence Invariant", "No hedging during the panel objection."), ("warning", "Filler Words", "Replace 'basically' with a deliberate pause.")]),
        takeaway="Pause for two beats before each new segment instead of filling the gap.",
    )


async def _wipe(user: User) -> None:
    await TaskBlock.find(TaskBlock.user_id == user.id).delete()
    await JournalEntry.find(JournalEntry.user_id == user.id).delete()
    await Flashcard.find(Flashcard.user_id == user.id).delete()


async def get_or_create_demo_user(today: dt.date) -> User:
    user = await User.find_one(User.email == DEMO_EMAIL)
    if user is None:
        user = User(name="Ram", email=DEMO_EMAIL, password_hash=hash_password(secrets.token_urlsafe(24)), is_demo=True, onboarded=True, goal="dsa", learner_level="intermediate",
                    daily_target_minutes=240)
        await user.insert()
    if user.demo_seeded_on != today:
        await _wipe(user)
        await _seed(user, today)
    return user


async def _seed(user: User, today: dt.date) -> None:
    rng = random.Random(7)
    modes = [TaskMode.CODE, TaskMode.CODE, TaskMode.PROSE, TaskMode.THEORY, TaskMode.SPEECH]
    names = {
        TaskMode.CODE: ["DSA Practice: Sliding Window Maximum", "Two Pointers & Sorted Squares", "Coin Change (DP)", "Number of Islands"],
        TaskMode.PROSE: ["Systems Narrative: Raft Partition", "ADR: Choosing a Message Queue"],
        TaskMode.THEORY: ["Theory & Recall: Raft Invariants", "Theory: Consistency Models"],
        TaskMode.SPEECH: ["Speech Studio: Architectural Defense Pitch", "Speech: Explain CAP Theorem"],
    }
    total_xp = 0
    # ---- 56 days of history (days 1..56 ago), contiguous for the last 14 so the streak is real ----
    for ago in range(56, 0, -1):
        d = today - dt.timedelta(days=ago)
        if ago > 14 and rng.random() < 0.3:
            continue
        for _ in range(rng.choice([1, 2, 2, 3])):
            mode = rng.choice(modes)
            minutes = rng.choice([30, 40, 45, 45, 50, 60])
            score = max(48, min(98, int(rng.gauss(80 + (56 - ago) * 0.15, 9))))
            cat = rng.choice(CODE_TOPICS) if mode == TaskMode.CODE else {"PROSE": "Technical Writing", "THEORY": "Distributed Systems", "SPEECH": "Technical Communication"}[mode.value]
            title = rng.choice(names[mode])
            sub = {TaskMode.CODE: SAMPLE_CODE, TaskMode.PROSE: SAMPLE_PROSE, TaskMode.THEORY: SAMPLE_NOTES, TaskMode.SPEECH: SAMPLE_TRANSCRIPT}[mode]
            m = _metrics(mode, score, rng, minutes)
            xp = max(5, round(score * minutes / 300))
            total_xp += xp
            await JournalEntry(
                user_id=user.id, task_id=user.id, task_title=title, task_mode=mode, category=cat,
                language="python" if mode == TaskMode.CODE else None, date=d,
                time_spent_seconds=int(minutes * 60 * rng.uniform(0.8, 1.05)), planned_minutes=minutes, user_submission=sub,
                hints_used=0 if rng.random() < 0.65 else rng.randint(1, 2), metrics=m, score=score, xp_earned=xp,
                ai_model="demo-seed", submission_sha=hashlib.sha256(sub.encode()).hexdigest(),
                created_at=dt.datetime.combine(d, dt.time(9 + rng.randint(0, 9), rng.randint(0, 59)), tzinfo=dt.timezone.utc),
            ).insert()

    # ---- today's schedule ----
    first = TaskBlock(
        user_id=user.id, date=today, order_index=0, title="Two Pointers & Sorted Squares", task_mode=TaskMode.CODE, duration_minutes=45,
        category="Two Pointers & Binary Search", language="python", status=TaskStatus.COMPLETED,
        description="Topic: Sliding Window & Two Pointers Algorithm Optimization", prompt_context="### Sorted Squares\nReturn the squares of a sorted array in sorted order.",
        content_ready=True, completed_at=dt.datetime.now(dt.timezone.utc), time_spent_seconds=45 * 60,
    )
    await first.insert()
    m = _metrics(TaskMode.CODE, 88, rng, 45)
    je = JournalEntry(user_id=user.id, task_id=first.id, task_title=first.title, task_mode=TaskMode.CODE, category=first.category, language="python",
                      date=today, time_spent_seconds=45 * 60, planned_minutes=45, user_submission=SAMPLE_CODE, metrics=m, score=88, xp_earned=13,
                      ai_model="demo-seed", submission_sha=hashlib.sha256(SAMPLE_CODE.encode()).hexdigest())
    await je.insert()
    first.journal_id = je.id
    await first.save()
    total_xp += 13

    await TaskBlock(
        user_id=user.id, date=today, order_index=1, title="Sliding Window Maximum", task_mode=TaskMode.CODE, duration_minutes=45,
        category="Sliding Window & Monotonic Deque", language="python", difficulty="Hard", tags=["Array", "Monotonic Deque"], content_ready=True,
        description="Topic: O(n) monotonic deque, window eviction at i − k + 1",
        prompt_context=(
            "### Problem\nYou are given an array of integers `nums`; there is a sliding window of size `k` which moves from the very left of the "
            "array to the very right. You can only see the `k` numbers in the window. Each time the window moves right by one position.\n\n"
            "Return the *max sliding window* — the maximum of each window.\n\n"
            "### Example 1\n```\nInput:  nums = [1,3,-1,-3,5,3,6,7], k = 3\nOutput: [3,3,5,5,6,7]\n```\n\n"
            "### Example 2\n```\nInput:  nums = [1], k = 1\nOutput: [1]\n```\n\n"
            "### Complexity goal\nTarget **O(n)** time and **O(k)** auxiliary space."
        ),
        constraints=["1 ≤ nums.length ≤ 10⁵", "−10⁴ ≤ nums[i] ≤ 10⁴", "1 ≤ k ≤ nums.length"],
        hints=["Brute force re-scans each window: O(n·k). What do you really need from the previous window?",
               "Keep *indices* of candidates in decreasing order of value — a monotonic deque.",
               "Pop from the back while the new value is larger; pop from the front when the index leaves the window."],
        starter_code="from typing import List\n\n\nclass Solution:\n    def maxSlidingWindow(self, nums: List[int], k: int) -> List[int]:\n        # TODO: O(n) with a monotonic deque\n        pass\n",
        test_cases=[
            TestCase(name="Standard window", call="Solution().maxSlidingWindow([1,3,-1,-3,5,3,6,7], 3)", expected="[3,3,5,5,6,7]"),
            TestCase(name="Single element", call="Solution().maxSlidingWindow([1], 1)", expected="[1]"),
            TestCase(name="k equals length", call="Solution().maxSlidingWindow([9,11], 2)", expected="[11]"),
            TestCase(name="Decreasing", call="Solution().maxSlidingWindow([7,6,5,4], 2)", expected="[7,6,5]"),
            TestCase(name="Negatives", call="Solution().maxSlidingWindow([-7,-8,7,5,7,1,6,0], 4)", expected="[7,7,7,7,7]"),
        ],
    ).insert()
    await TaskBlock(
        user_id=user.id, date=today, order_index=2, title="Distributed Consensus: Raft Protocol", task_mode=TaskMode.THEORY, duration_minutes=50,
        category="Distributed Systems", content_ready=True, description="Topic: Leader Election, Heartbeats & Split-Brain Invariants",
        prompt_context=(
            "## 01 The Problem of Replicated State Machines\nReplicated state machines are typically implemented using a replicated write-ahead log. "
            "Each server stores a log containing a sequence of commands, which its state machine executes in deterministic order.\n\n"
            "```\nClient -> Consensus Module (Leader) -> Replicated Log [1:x=3][2:y=9] -> State Machine\n```\n\n"
            "## 02 Election Safety & Randomized Heartbeat Timers\nFollowers remain passive until their **randomized election timer** expires without receiving an AppendEntries heartbeat. "
            "Timeouts are chosen uniformly from **150ms–300ms** so that split votes are rare and resolve quickly. A candidate increments its term, votes for itself, and sends RequestVote RPCs; "
            "it needs a **strict majority** (⌊N/2⌋+1). A voter only grants its vote if the candidate's log is at least as up-to-date as its own.\n\n"
            "## 03 Joint Consensus during Membership Changes\nChanging cluster configuration in one atomic step is unsafe because servers switch at different times. Raft uses **joint consensus (C_old,new)**: "
            "decisions require a majority of C_old **and** a majority of C_new simultaneously.\n\n"
            "## 04 Log Compaction\nServers snapshot their state machine and discard the log prefix; a leader sends **InstallSnapshot** to followers that lag behind the snapshot point."
        ),
        checklist=["Leader election safety & term strictly increasing", "Log matching invariant established inductively",
                   "Joint consensus overlap during server reassignment", "Log compaction & snapshot memory serialization"],
        hints=["Explain *why* randomisation breaks symmetry.", "Write the Log Matching property as two guarantees."],
    ).insert()
    await TaskBlock(
        user_id=user.id, date=today, order_index=3, title="Architecture Pitch Presentation", task_mode=TaskMode.SPEECH, duration_minutes=30,
        category="Technical Communication", content_ready=True, target_wpm=135, description="Topic: Zero-copy serde & io_uring log segments",
        prompt_context=(
            "### Segment 01 — The Hook (00:00–00:30)\n\"Good morning panel. Today we eliminate 85% of tail latency in our distributed state machine without adding a single byte of DRAM overhead.\" "
            "[PAUSE – 2s, hold eye contact]\n\n### Segment 02 — Core Mechanism (00:30–01:15)\n\"By anchoring the log segment across mmap pages with io_uring SQ/CQ rings, we commit batches without a single context switch. "
            "We use zero-copy deserialization via FlatBuffers directly from mapped memory.\" [CADENCE: slow down on io_uring specifics]\n\n"
            "### Segment 03 — Panel Defense (01:15–03:00)\n**Objection:** \"Why not Apache Arrow?\" — \"Arrow carries schema runtime overhead; our FlatBuffer schema compiles to zero metadata overhead.\""
        ),
        checklist=["State the 85% tail-latency claim", "Explain io_uring + mmap in one sentence", "Name zero-copy deserialization", "Answer the Arrow objection without hedging"],
        hints=["Pause two beats between segments.", "Say numbers slowly."],
    ).insert()
    await TaskBlock(
        user_id=user.id, date=today, order_index=4, title="Systems Engineering Narrative", task_mode=TaskMode.PROSE, duration_minutes=45,
        category="Technical Writing", content_ready=True, word_target_min=600, word_target_max=800, description="Topic: The Day Raft Partitioned — case narrative",
        prompt_context=(
            "### Brief\nDraft a gripping, technically rigorous narrative showing how Raft safeguards state invariants when an asymmetric inter-region network split severs Leader Node A "
            "from its followers. Ground the dialogue in production realities while detailing internal state-machine transitions.\n\n**Persona:** Staff SRE · **Voice:** cinematic, tense, exacting."
        ),
        constraints=["Cite real clock semantics (150–300ms election timeouts, 50ms heartbeats).", "Node A must never acknowledge an uncommitted write.",
                     "Avoid cartoonish tech metaphors."],
        checklist=["Term incrementation on election timeout (41 → 42)", "Heartbeat threshold boundary (150–300ms)", "Strict majority quorum (3 of 5)", "Reconnection: Node A steps down and truncates divergent entries"],
        hints=["Open with a sensory detail, not an explanation.", "Show the commit index freezing."],
    ).insert()
    # backlog
    await TaskBlock(user_id=user.id, date=None, order_index=0, title="WebAssembly SIMD", task_mode=TaskMode.THEORY, duration_minutes=45, category="Web Platform",
                    description="Vectorized processing in browsers").insert()
    await TaskBlock(user_id=user.id, date=None, order_index=1, title="Type-Level TypeScript", task_mode=TaskMode.CODE, duration_minutes=30, category="TypeScript",
                    language="typescript", description="Conditional types & inference").insert()

    # flashcards
    for i, (f, b) in enumerate([
        ("Why must candidate election timeouts in Raft be chosen randomly (150–300ms)?", "Randomisation breaks symmetry: with a fixed timeout nodes would start candidacies simultaneously and split votes repeatedly."),
        ("What two guarantees constitute the Log Matching Property?", "If two entries in different logs have the same index and term they store the same command, and all preceding entries are identical."),
        ("Why can a leader not commit entries from a previous term by counting replicas?", "Figure 8 anomaly: an old-term entry on a majority can still be overwritten; commit a current-term entry first."),
        ("What does joint consensus require for decisions?", "A majority of C_old AND a majority of C_new at the same time."),
    ]):
        await Flashcard(user_id=user.id, front=f, back=b, topic="Raft", box=1 + i % 3, due_date=today).insert()

    # streak = 14 contiguous days up to today
    user.streak_count, user.longest_streak = 14, 21
    user.last_active_date = today
    user.xp = total_xp
    user.demo_seeded_on = today
    await user.save()
