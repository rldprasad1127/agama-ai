"""Fixed, ordered curricula. The AI never invents the roadmap — it only authors each lesson / problem."""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Problem:
    title: str
    difficulty: str            # Easy | Medium | Hard
    note: str = ""             # extra authoring hint (I/O conventions etc.)


@dataclass(frozen=True)
class Topic:
    key: str
    name: str
    weight: float              # relative share of study time
    priority: int              # 1 = keep first when the schedule is too short to fit everything
    theory: str                # what the beginner lesson must cover
    problems: tuple[Problem, ...] = field(default_factory=tuple)


E, M, H = "Easy", "Medium", "Hard"
_LL = "Linked lists: define class ListNode in starter_code plus helpers from_list(list)->ListNode and to_list(node)->list; the tested function takes/returns plain Python lists and uses those helpers internally."
_TREE = "Trees: define class TreeNode in starter_code plus build_tree(level_order_list with None) and helpers; the tested function takes/returns plain lists (level-order, None for null) or numbers."
_GRAPH = "Graphs: inputs are plain lists (edge list / adjacency list / grid); outputs are numbers, booleans or lists."

DSA: tuple[Topic, ...] = (
    Topic("complexity", "Big-O & Complexity Basics", 0.8, 6,
          "What an algorithm and a data structure are; counting operations; Big-O for O(1), O(log n), O(n), O(n log n), O(n^2); best/worst case; space complexity; how to read constraints like n <= 10^5.",
          (Problem("Find the Duplicate Number (Brute Force vs Optimised)", E), Problem("Count Pairs With a Given Sum", E),
           Problem("Check If Array Is Sorted and Rotated", M))),
    Topic("arrays", "Arrays & Strings", 1.4, 1,
          "Arrays in memory, indexing, insertion/deletion cost, in-place updates, prefix sums, string basics and immutability, common traps (off-by-one).",
          (Problem("Two Sum", E), Problem("Move Zeroes", E), Problem("Best Time to Buy and Sell Stock", E),
           Problem("Maximum Subarray", M), Problem("Product of Array Except Self", M), Problem("Rotate Array", M))),
    Topic("hashing", "Hash Maps & Sets", 1.2, 2,
          "How a hash table works, collisions, O(1) average lookup, sets vs maps, frequency counting, grouping by key.",
          (Problem("Contains Duplicate", E), Problem("Valid Anagram", E), Problem("Group Anagrams", M),
           Problem("Longest Consecutive Sequence", M), Problem("Subarray Sum Equals K", M))),
    Topic("two_pointers", "Two Pointers", 1.0, 3,
          "Using two indices moving toward or along each other; when sorted order makes it work; fast/slow idea; examples with palindromes and pairs.",
          (Problem("Valid Palindrome", E), Problem("Two Sum II - Sorted Array", M), Problem("Container With Most Water", M),
           Problem("3Sum", M), Problem("Trapping Rain Water", H))),
    Topic("sliding_window", "Sliding Window", 1.1, 4,
          "Fixed and variable windows, expanding/shrinking, maintaining a running state (sum, counts), when sliding window applies.",
          (Problem("Maximum Average Subarray I", E), Problem("Longest Substring Without Repeating Characters", M),
           Problem("Minimum Size Subarray Sum", M), Problem("Permutation in String", M), Problem("Sliding Window Maximum", H))),
    Topic("stack_queue", "Stacks & Queues", 1.0, 8,
          "LIFO vs FIFO, push/pop/peek, deque, monotonic stack idea, typical uses (parentheses, undo, BFS).",
          (Problem("Valid Parentheses", E), Problem("Min Stack", M), Problem("Daily Temperatures", M),
           Problem("Evaluate Reverse Polish Notation", M), Problem("Largest Rectangle in Histogram", H))),
    Topic("linked_list", "Linked Lists", 1.1, 9,
          "Nodes and pointers, singly vs doubly linked, insertion/deletion, reversing, fast/slow pointers, dummy head trick.",
          (Problem("Reverse Linked List", E, _LL), Problem("Merge Two Sorted Lists", E, _LL), Problem("Linked List Cycle", E, _LL),
           Problem("Remove Nth Node From End of List", M, _LL), Problem("Reorder List", M, _LL))),
    Topic("binary_search", "Binary Search", 1.1, 5,
          "Halving the search space, loop invariants, lo/hi/mid pitfalls, searching on the answer, rotated arrays.",
          (Problem("Binary Search", E), Problem("Search Insert Position", E), Problem("Search in Rotated Sorted Array", M),
           Problem("Find Peak Element", M), Problem("Koko Eating Bananas", M), Problem("Median of Two Sorted Arrays", H))),
    Topic("sorting", "Sorting & Intervals", 0.9, 12,
          "Bubble/insertion vs merge/quick sort, stability, O(n log n) bound, sorting as a preprocessing step, merging intervals.",
          (Problem("Sort Colors", M), Problem("Merge Intervals", M), Problem("Kth Largest Element in an Array", M),
           Problem("Meeting Rooms II", M))),
    Topic("recursion", "Recursion & Backtracking", 1.3, 10,
          "Base case + recursive case, the call stack, memoisation preview, choose/explore/un-choose template, pruning.",
          (Problem("Climbing Stairs (Recursive)", E), Problem("Subsets", M), Problem("Permutations", M),
           Problem("Combination Sum", M), Problem("N-Queens", H))),
    Topic("trees", "Trees & BST", 1.5, 6,
          "Binary trees, depth/height, DFS (pre/in/post order) vs BFS, BST property, recursion on trees.",
          (Problem("Maximum Depth of Binary Tree", E, _TREE), Problem("Invert Binary Tree", E, _TREE),
           Problem("Binary Tree Level Order Traversal", M, _TREE), Problem("Validate Binary Search Tree", M, _TREE),
           Problem("Lowest Common Ancestor of a BST", M, _TREE), Problem("Binary Tree Maximum Path Sum", H, _TREE))),
    Topic("heaps", "Heaps & Priority Queues", 1.0, 11,
          "Min/max heap idea, push/pop O(log n), heapq usage, top-K patterns, two-heap median.",
          (Problem("Last Stone Weight", E), Problem("Top K Frequent Elements", M), Problem("K Closest Points to Origin", M),
           Problem("Merge K Sorted Lists", H, _LL))),
    Topic("graphs", "Graphs (BFS / DFS)", 1.6, 7,
          "Nodes and edges, adjacency list vs matrix, BFS for shortest path in unweighted graphs, DFS for connectivity, visited sets, grids as graphs, topological order.",
          (Problem("Flood Fill", E, _GRAPH), Problem("Number of Islands", M, _GRAPH), Problem("Clone Graph", M, _GRAPH),
           Problem("Course Schedule", M, _GRAPH), Problem("Rotting Oranges", M, _GRAPH), Problem("Word Ladder", H, _GRAPH))),
    Topic("dp", "Dynamic Programming", 1.8, 5,
          "Overlapping subproblems and optimal substructure, top-down memoisation vs bottom-up tabulation, defining state and transition, 1-D and 2-D DP.",
          (Problem("Climbing Stairs", E), Problem("House Robber", M), Problem("Coin Change", M),
           Problem("Longest Increasing Subsequence", M), Problem("Longest Common Subsequence", M), Problem("Edit Distance", H))),
)
DSA_BY_KEY = {t.key: t for t in DSA}


def topic_names() -> list[dict]:
    return [{"key": t.key, "name": t.name, "problems": len(t.problems), "weight": t.weight} for t in DSA]


# ───────────────────────── placement quiz (graded server-side, no AI cost) ─────────────────────────
@dataclass(frozen=True)
class QuizQ:
    id: str
    topic: str
    prompt: str
    options: tuple[str, ...]
    answer: int


PLACEMENT: tuple[QuizQ, ...] = (
    QuizQ("q1", "complexity", "What is the time complexity of looking up an element by index in an array?", ("O(1)", "O(log n)", "O(n)", "O(n^2)"), 0),
    QuizQ("q2", "arrays", "Which technique finds the sum of any subarray in O(1) after O(n) preprocessing?", ("Binary search", "Prefix sums", "Recursion", "Hashing the sum"), 1),
    QuizQ("q3", "hashing", "Average-case time to insert a key into a hash map?", ("O(1)", "O(log n)", "O(n)", "O(n log n)"), 0),
    QuizQ("q4", "two_pointers", "Two pointers on a sorted array can find a pair with a target sum in:", ("O(n^2)", "O(n log n)", "O(n)", "O(1)"), 2),
    QuizQ("q5", "sliding_window", "A sliding window is best for:", ("Shortest path in a graph", "Longest/shortest contiguous subarray under a condition", "Sorting a list", "Detecting cycles"), 1),
    QuizQ("q6", "stack_queue", "Which structure is the natural fit for matching nested brackets?", ("Queue", "Stack", "Heap", "Hash set"), 1),
    QuizQ("q7", "linked_list", "How can you detect a cycle in a linked list using O(1) extra memory?", ("Hash set of nodes", "Sort the nodes", "Fast and slow pointers", "Recursion"), 2),
    QuizQ("q8", "binary_search", "Binary search requires the data to be:", ("Unique", "Sorted (or monotonic)", "Positive", "Stored in a linked list"), 1),
    QuizQ("q9", "sorting", "Worst-case time of merge sort?", ("O(n)", "O(n log n)", "O(n^2)", "O(log n)"), 1),
    QuizQ("q10", "recursion", "Every correct recursive function must have:", ("A loop", "A base case", "A global variable", "Memoisation"), 1),
    QuizQ("q11", "trees", "An in-order traversal of a binary SEARCH tree visits keys in:", ("Random order", "Descending order", "Ascending order", "Level order"), 2),
    QuizQ("q12", "heaps", "Time to remove the minimum from a binary min-heap of n items?", ("O(1)", "O(log n)", "O(n)", "O(n log n)"), 1),
    QuizQ("q13", "graphs", "Which traversal finds the shortest path (fewest edges) in an unweighted graph?", ("DFS", "BFS", "Inorder", "Binary search"), 1),
    QuizQ("q14", "dp", "Dynamic programming applies when a problem has:", ("Sorted input", "Overlapping subproblems and optimal substructure", "A tree shape", "Negative numbers"), 1),
)
