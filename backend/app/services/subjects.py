"""Catalog of built-in subjects (ordered syllabi) + helpers for AI-drafted custom subjects.

Every subject is a fixed, hand-written syllabus; the AI only authors each lesson / exercise on demand.
A *custom* subject is the one exception: its syllabus is drafted by the AI, shown to the learner for review
and flagged as "AI-generated, not reviewed".

kinds
  dsa       LeetCode-style problems, any supported language, executable tests
  code      programming exercises in one fixed language with executable tests (Python, JavaScript)
  sql       SQL exercises run against an in-memory SQLite database (output shown, AI-reviewed)
  exercise  written / hands-on exercises reviewed by the AI (Excel, Power BI, …); nothing is executed
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from app.models.enums import TaskMode
from app.services.curriculum import DSA, Problem, Topic

E, M, H = "Easy", "Medium", "Hard"
_PY = "Use plain functions (no class named Solution); every test `call` is a single expression calling the function."
_JS = "Use plain functions (no class named Solution); every test `call` is a single expression calling the function; values are JSON-like."


@dataclass(frozen=True)
class Subject:
    key: str
    name: str
    icon: str                        # Material Symbols name
    blurb: str
    group: str                       # Programming | Data & Analytics | Tools
    kind: str                        # dsa | code | sql | exercise
    featured: bool
    topics: tuple[Topic, ...]
    language: Optional[str] = None   # fixed language for code / sql kinds
    note: str = ""                   # honest limitation shown on the subject page
    has_placement: bool = False
    custom: bool = False

    @property
    def practice_mode(self) -> TaskMode:
        return TaskMode.PROSE if self.kind == "exercise" else TaskMode.CODE

    @property
    def noun(self) -> str:
        return "problem" if self.kind in ("dsa", "code") else "exercise"


def P(title: str, diff: str = E, note: str = "") -> Problem:
    return Problem(title, diff, note)


_SQLN = "SQL exercise: put CREATE TABLE + INSERT statements for the sample data in starter_code."
_XLN = "Written exercise: give a small sample table in prompt_context; the learner answers with the formulas / steps."
_BIN = "Written exercise: describe the scenario and the sample data in prompt_context; the learner answers with the steps / DAX / settings."

PYTHON = Subject("python", "Python", "terminal", "From your first line of code to writing real programs.", "Programming", "code", True, (
    Topic("py_basics", "Variables, Types & Operators", 1.0, 1, "Variables, int/float/str/bool, type conversion, arithmetic and comparison operators, input and print, f-strings.",
          (P("Temperature Converter", E, _PY), P("Even or Odd", E, _PY), P("Swap Two Values", E, _PY), P("Simple Interest", E, _PY))),
    Topic("py_control", "Conditions & Loops", 1.2, 2, "if/elif/else, for and while loops, range, break/continue, nested loops, common loop patterns.",
          (P("FizzBuzz", E, _PY), P("Sum of Digits", E, _PY), P("Count Vowels", E, _PY), P("Prime Check", M, _PY), P("Collatz Steps", M, _PY))),
    Topic("py_functions", "Functions", 1.2, 3, "def, parameters and return values, default and keyword arguments, scope, docstrings, small pure functions.",
          (P("Factorial", E, _PY), P("Is Palindrome", E, _PY), P("Greatest Common Divisor", M, _PY), P("Power Without **", M, _PY))),
    Topic("py_strings", "Strings", 1.0, 4, "Indexing and slicing, common string methods, split/join, formatting, immutability.",
          (P("Reverse Words", E, _PY), P("Title Case", E, _PY), P("Caesar Cipher", M, _PY), P("Compress Repeated Letters", M, _PY))),
    Topic("py_collections", "Lists & Tuples", 1.2, 5, "Lists, indexing, slicing, append/insert/remove, sorting, tuples, unpacking, list comprehensions.",
          (P("Second Largest", E, _PY), P("Remove Duplicates Keep Order", E, _PY), P("Rotate List", M, _PY), P("Flatten Nested List", M, _PY))),
    Topic("py_dicts", "Dictionaries & Sets", 1.2, 6, "Dict creation, get/items, counting with dicts, sets and set operations, when to use which.",
          (P("Word Frequency", E, _PY), P("Common Elements", E, _PY), P("Invert a Dictionary", M, _PY), P("First Unique Character", M, _PY))),
    Topic("py_errors", "Files & Error Handling", 0.8, 7, "try/except/finally, raising exceptions, reading and writing text files with `with`, parsing simple CSV text.",
          (P("Safe Divide", E, _PY), P("Parse Integers Safely", E, _PY), P("Count Lines in Text", M, _PY))),
    Topic("py_oop", "Classes & Objects", 1.2, 8, "class, __init__, attributes and methods, self, __str__, simple inheritance.",
          (P("Bank Account Class", M, _PY), P("Stack Class", M, _PY), P("Shape Area Classes", M, _PY))),
    Topic("py_modules", "Comprehensions & Standard Library", 0.9, 9, "List/dict comprehensions, lambda, sorted with key, collections.Counter, itertools basics, datetime.",
          (P("Squares of Evens", E, _PY), P("Group Words by Length", M, _PY), P("Top Three Most Common", M, _PY))),
), language="python")

JAVASCRIPT = Subject("javascript", "JavaScript", "javascript", "The language of the web — core language skills with runnable tests.", "Programming", "code", False, (
    Topic("js_basics", "Variables, Types & Operators", 1.0, 1, "let/const, number/string/boolean/null/undefined, template literals, equality (=== vs ==), truthy and falsy.",
          (P("Celsius to Fahrenheit", E, _JS), P("Is Truthy Count", E, _JS), P("Clamp a Number", E, _JS))),
    Topic("js_control", "Conditions & Loops", 1.0, 2, "if/else, switch, for / while / for...of, early return, common loop patterns.",
          (P("FizzBuzz", E, _JS), P("Sum of Digits", E, _JS), P("Prime Check", M, _JS), P("Count Vowels", E, _JS))),
    Topic("js_functions", "Functions & Scope", 1.3, 3, "Function declarations vs arrow functions, parameters/defaults/rest, scope and closures, higher-order functions.",
          (P("Make Counter (Closure)", M, _JS), P("Compose Two Functions", M, _JS), P("Once", M, _JS), P("Sum With Rest Parameters", E, _JS))),
    Topic("js_arrays", "Arrays & Array Methods", 1.4, 4, "Indexing, push/pop/slice/splice, map/filter/reduce/find/some/every, sorting, spread.",
          (P("Double Evens", E, _JS), P("Sum of Squares With reduce", E, _JS), P("Unique Values", E, _JS), P("Chunk an Array", M, _JS), P("Flatten One Level", M, _JS))),
    Topic("js_objects", "Objects & JSON", 1.2, 5, "Object literals, property access, destructuring, Object.keys/entries, JSON.parse/stringify, copying vs referencing.",
          (P("Count Occurrences", E, _JS), P("Group By Property", M, _JS), P("Deep Get By Path", M, _JS), P("Merge Two Objects", E, _JS))),
    Topic("js_async", "Promises & Async/Await", 1.0, 6, "The event loop idea, callbacks, Promises, async/await, error handling with try/catch, Promise.all.",
          (P("Delay Returns Value", M, _JS), P("Run Promises In Sequence", M, _JS), P("Retry a Failing Call", H, _JS))),
    Topic("js_classes", "Classes & Modern Syntax", 0.9, 7, "class, constructor, methods, inheritance, getters, optional chaining, nullish coalescing.",
          (P("Rectangle Class", E, _JS), P("Queue Class", M, _JS), P("Event Emitter", M, _JS))),
), language="javascript")

SQL = Subject("sql", "SQL", "database", "Query data confidently — you run real queries on sample tables.", "Data & Analytics", "sql", True, (
    Topic("sql_select", "SELECT, WHERE & ORDER BY", 1.2, 1, "Tables, rows and columns; SELECT, WHERE with AND/OR/IN/BETWEEN/LIKE, ORDER BY, LIMIT, DISTINCT, NULL handling.",
          (P("Find Customers From One City", E, _SQLN), P("Top 5 Most Expensive Products", E, _SQLN), P("Orders In A Date Range", E, _SQLN), P("Customers Without An Email", E, _SQLN))),
    Topic("sql_agg", "Aggregates & GROUP BY", 1.3, 2, "COUNT/SUM/AVG/MIN/MAX, GROUP BY, HAVING vs WHERE, aggregating with conditions (CASE).",
          (P("Revenue Per Category", E, _SQLN), P("Customers With 3+ Orders", M, _SQLN), P("Average Order Value By Month", M, _SQLN))),
    Topic("sql_joins", "Joins", 1.5, 3, "Primary and foreign keys, INNER / LEFT JOIN, joining 3 tables, anti-joins (customers with no orders), self joins.",
          (P("Orders With Customer Names", E, _SQLN), P("Customers Who Never Ordered", M, _SQLN), P("Top Customer Per City", M, _SQLN), P("Employees And Their Managers", M, _SQLN))),
    Topic("sql_sub", "Subqueries & CTEs", 1.1, 4, "Scalar and IN subqueries, correlated subqueries, EXISTS, WITH (CTE) to structure queries.",
          (P("Products Above Average Price", M, _SQLN), P("Customers With Above-Average Spend", M, _SQLN), P("Second Highest Salary", M, _SQLN))),
    Topic("sql_window", "Window Functions", 1.2, 5, "OVER, PARTITION BY, ROW_NUMBER / RANK, running totals, LAG / LEAD.",
          (P("Rank Employees By Salary In Department", M, _SQLN), P("Running Total Of Sales", M, _SQLN), P("Month Over Month Change", H, _SQLN))),
    Topic("sql_dml", "Changing Data & Tables", 0.8, 6, "INSERT, UPDATE, DELETE, CREATE TABLE with constraints, ALTER, safe habits (SELECT before UPDATE).",
          (P("Create A Table With Constraints", E, _SQLN), P("Update Prices By Category", E, _SQLN), P("Delete Duplicate Rows", M, _SQLN))),
    Topic("sql_design", "Design & Indexes", 0.7, 7, "Normalisation basics (1NF-3NF), relationships, what an index is and when it helps, reading simple query plans.",
          (P("Normalise An Orders Table", M, _SQLN), P("Choose The Right Index", M, _SQLN))),
), language="sql", note="Queries run against a small in-memory SQLite database; the AI reviews your result and approach.")

EXCEL = Subject("excel", "Excel", "table_chart", "Formulas, lookups, pivot tables and clean-ups for everyday work.", "Data & Analytics", "exercise", True, (
    Topic("xl_basics", "Formulas & Cell Basics", 1.0, 1, "Cells and ranges, relative vs absolute references ($A$1), SUM/AVERAGE/MIN/MAX/COUNT, order of operations, fill handle.",
          (P("Monthly Budget Totals", E, _XLN), P("Grade Calculator", E, _XLN), P("Sales Tax And Discounts", E, _XLN))),
    Topic("xl_logic", "Logical & Text Functions", 1.2, 2, "IF/IFS/AND/OR, COUNTIF(S)/SUMIF(S), LEFT/RIGHT/MID, TRIM, CONCAT/TEXTJOIN.",
          (P("Pass / Fail With Grades", E, _XLN), P("Commission By Sales Tier", M, _XLN), P("Split Full Names", E, _XLN), P("Sales By Region With SUMIFS", M, _XLN))),
    Topic("xl_lookup", "Lookup Functions", 1.4, 3, "VLOOKUP and its limits, XLOOKUP, INDEX/MATCH, exact vs approximate match, handling #N/A.",
          (P("Price Lookup From A Product List", E, _XLN), P("Employee Details With XLOOKUP", M, _XLN), P("Tax Bracket Approximate Match", M, _XLN))),
    Topic("xl_clean", "Cleaning Data", 1.0, 4, "Remove duplicates, Text to Columns, Flash Fill, find/replace, data validation, consistent dates and numbers.",
          (P("Clean A Messy Contact List", E, _XLN), P("Fix Text Dates", M, _XLN), P("Drop-down Validation For A Form", E, _XLN))),
    Topic("xl_pivot", "Pivot Tables", 1.5, 5, "Creating a pivot table, rows/columns/values/filters, grouping dates, calculated fields, slicers.",
          (P("Sales By Region And Month", E, _XLN), P("Top 5 Products", M, _XLN), P("Year-Over-Year Comparison", M, _XLN))),
    Topic("xl_charts", "Charts & Conditional Formatting", 1.0, 6, "Choosing a chart type, column/line/pie best practice, conditional formatting, sparklines, a simple dashboard layout.",
          (P("Pick The Right Chart", E, _XLN), P("Highlight Overdue Tasks", E, _XLN), P("One-Page Sales Dashboard", M, _XLN))),
    Topic("xl_advanced", "Dynamic Arrays & Automation Basics", 0.8, 7, "FILTER, SORT, UNIQUE, LET, named ranges, tables, what a macro is and when to record one.",
          (P("Filter And Sort A Customer List", M, _XLN), P("Unique Customers With Totals", M, _XLN))),
), note="Excel isn't run inside Agama: you write the formulas/steps as your answer and the AI reviews them.")

POWERBI = Subject("powerbi", "Power BI", "monitoring", "Turn raw data into interactive reports and dashboards.", "Data & Analytics", "exercise", False, (
    Topic("pbi_intro", "Power BI Basics", 0.8, 1, "Desktop vs Service, reports/datasets/dashboards, the three views (Report, Data, Model), how data flows from source to visual.",
          (P("Explain The Power BI Workflow", E, _BIN), P("Choose Import vs DirectQuery", M, _BIN))),
    Topic("pbi_pq", "Getting & Cleaning Data (Power Query)", 1.4, 2, "Connecting to Excel/CSV/SQL, applying transformations (remove columns, split, replace, data types, unpivot, merge/append), applied steps.",
          (P("Clean A Sales CSV", E, _BIN), P("Unpivot Monthly Columns", M, _BIN), P("Append Several Files", M, _BIN))),
    Topic("pbi_model", "Data Modelling", 1.5, 3, "Star schema, fact vs dimension tables, relationships and cardinality, filter direction, a date table.",
          (P("Design A Star Schema For Sales", M, _BIN), P("Fix A Many-To-Many Relationship", M, _BIN), P("Create A Date Table", M, _BIN))),
    Topic("pbi_dax", "DAX Fundamentals", 1.8, 4, "Calculated columns vs measures, SUM/COUNT/DISTINCTCOUNT, CALCULATE and filters, DIVIDE, row vs filter context, variables.",
          (P("Total Sales And Profit Margin Measures", E, _BIN), P("Sales For One Category With CALCULATE", M, _BIN), P("Percent Of Total", M, _BIN))),
    Topic("pbi_time", "Time Intelligence", 1.0, 5, "TOTALYTD, SAMEPERIODLASTYEAR, DATEADD, year-over-year and rolling averages.",
          (P("Year-To-Date Sales", M, _BIN), P("Year-Over-Year Growth", M, _BIN))),
    Topic("pbi_visuals", "Visuals & Report Design", 1.2, 6, "Choosing visuals, slicers, drill-through, tooltips, bookmarks, themes, layout and accessibility.",
          (P("Design An Executive Summary Page", M, _BIN), P("Add Drill-Through To A Detail Page", M, _BIN))),
    Topic("pbi_service", "Publishing & Sharing", 0.7, 7, "Publish to the Service, workspaces, refresh schedules, row-level security, apps.",
          (P("Plan Refresh And Sharing For A Team", M, _BIN), P("Write A Row-Level Security Rule", M, _BIN))),
), note="Power BI can't run inside Agama: exercises are written answers (steps, Power Query steps, DAX) reviewed by the AI. Practice in Power BI Desktop alongside.")

TABLEAU = Subject("tableau", "Tableau", "bar_chart", "Build charts and dashboards that tell a story.", "Data & Analytics", "exercise", False, (
    Topic("tb_intro", "Connecting & Tableau Basics", 0.9, 1, "Data sources, dimensions vs measures, discrete vs continuous (blue/green), the shelves, Show Me.",
          (P("Describe Dimensions vs Measures In A Sales Table", E, _BIN), P("Build A First Bar Chart", E, _BIN))),
    Topic("tb_charts", "Core Charts", 1.4, 2, "Bar, line, scatter, map, dual-axis, sorting, filters, groups, sets, parameters.",
          (P("Sales Trend With Forecast", M, _BIN), P("Top N With A Parameter", M, _BIN), P("Dual-Axis Profit vs Sales", M, _BIN))),
    Topic("tb_calc", "Calculated Fields & LOD", 1.6, 3, "Calculated fields, IF/CASE, table calculations, FIXED / INCLUDE / EXCLUDE LOD expressions.",
          (P("Profit Ratio Field", E, _BIN), P("Customer First-Order Date With FIXED", M, _BIN), P("Percent Of Total Table Calc", M, _BIN))),
    Topic("tb_dash", "Dashboards & Actions", 1.3, 4, "Layout containers, dashboard actions (filter/highlight/URL), device layouts, formatting for readability.",
          (P("Build An Interactive Sales Dashboard", M, _BIN), P("Add A Filter Action", M, _BIN))),
    Topic("tb_story", "Storytelling & Sharing", 0.8, 5, "Story points, choosing the right chart for the message, publishing to Tableau Cloud/Public, extracts vs live.",
          (P("Turn A Finding Into A Three-Step Story", M, _BIN), P("Choose Extract vs Live", E, _BIN))),
), note="Tableau can't run inside Agama: exercises are written answers reviewed by the AI. Practice in Tableau Desktop/Public alongside.")

STATS = Subject("stats", "Statistics", "functions", "The statistics you need for data work, with worked numbers.", "Data & Analytics", "exercise", False, (
    Topic("st_desc", "Descriptive Statistics", 1.2, 1, "Mean, median, mode, range, variance, standard deviation, quartiles, outliers, reading a histogram and box plot.",
          (P("Mean Median Mode Of A Small Set", E, "Written exercise with a small data set in prompt_context; show calculations."), P("Spot Outliers With The IQR Rule", M, "Written exercise with a data set; show calculations."))),
    Topic("st_prob", "Probability", 1.3, 2, "Sample space, events, addition and multiplication rules, conditional probability, Bayes' theorem.",
          (P("Two Dice Probabilities", E, "Written exercise; show reasoning."), P("Medical Test And Bayes", M, "Written exercise; show reasoning."))),
    Topic("st_dist", "Distributions", 1.2, 3, "Binomial, normal distribution, z-scores, the 68-95-99.7 rule.",
          (P("Z-Score And Percentile", M, "Written exercise with numbers; show calculations."), P("Binomial Coin Flips", M, "Written exercise; show calculations."))),
    Topic("st_sampling", "Sampling & Central Limit Theorem", 1.0, 4, "Population vs sample, sampling bias, standard error, the central limit theorem, confidence intervals.",
          (P("Spot The Sampling Bias", E, "Written exercise."), P("Confidence Interval For A Mean", M, "Written exercise with numbers; show calculations."))),
    Topic("st_tests", "Hypothesis Testing", 1.5, 5, "Null and alternative hypotheses, p-values, type I/II errors, t-test and chi-square intuition, practical vs statistical significance.",
          (P("Interpret A P-Value", M, "Written exercise."), P("A/B Test Decision", M, "Written exercise with conversion numbers."))),
    Topic("st_reg", "Correlation & Regression", 1.2, 6, "Correlation vs causation, scatterplots, simple linear regression, interpreting slope and R-squared.",
          (P("Interpret A Regression Output", M, "Written exercise with a small output table."), P("Why Correlation Is Not Causation", E, "Written exercise."))),
), note="Exercises are written answers with worked numbers, reviewed by the AI.")

ML = Subject("ml", "Machine Learning Basics", "psychology", "Core ideas behind machine learning, explained without heavy maths.", "Data & Analytics", "exercise", False, (
    Topic("ml_intro", "What ML Is & The Workflow", 0.9, 1, "Supervised vs unsupervised learning, features and labels, training vs testing data, the end-to-end workflow.",
          (P("Classify ML Problems", E, "Written exercise."), P("Design A Train/Test Split", E, "Written exercise."))),
    Topic("ml_data", "Preparing Data", 1.2, 2, "Missing values, encoding categories, scaling, leakage, feature engineering basics.",
          (P("Handle Missing Values", E, "Written exercise with a small table."), P("Find The Data Leak", M, "Written exercise."))),
    Topic("ml_reg", "Regression", 1.2, 3, "Linear regression idea, loss, gradient descent intuition, regularisation intuition.",
          (P("Explain Gradient Descent To A Friend", M, "Written exercise."), P("Interpret Coefficients", M, "Written exercise."))),
    Topic("ml_class", "Classification", 1.3, 4, "Logistic regression, decision boundary, k-nearest neighbours, decision trees.",
          (P("Choose A Model For Spam Detection", M, "Written exercise."), P("Trace A Decision Tree Split", M, "Written exercise."))),
    Topic("ml_eval", "Evaluation & Overfitting", 1.5, 5, "Accuracy, precision, recall, F1, confusion matrix, ROC-AUC, cross-validation, overfitting vs underfitting.",
          (P("Read A Confusion Matrix", M, "Written exercise with numbers."), P("Diagnose Overfitting From Curves", M, "Written exercise."))),
    Topic("ml_ens", "Ensembles & Next Steps", 0.9, 6, "Random forests, boosting intuition, what deep learning adds, responsible use of ML.",
          (P("Why Random Forests Beat One Tree", M, "Written exercise."), P("Plan Your Next Project", E, "Written exercise."))),
), note="Conceptual exercises reviewed by the AI (no code execution).")

GIT = Subject("git", "Git & GitHub", "merge", "Version control you will use every day as a developer.", "Tools", "exercise", False, (
    Topic("git_basics", "Repositories & Commits", 1.0, 1, "init/clone, working tree vs staging area vs history, add/commit/status/log/diff, good commit messages, .gitignore.",
          (P("Make Your First Commit", E, "Written exercise: give the exact commands in order."), P("Write Good Commit Messages", E, "Written exercise."))),
    Topic("git_branch", "Branching & Merging", 1.4, 2, "Branches, switch/checkout, merge vs fast-forward, resolving conflicts, rebase intuition.",
          (P("Create A Feature Branch And Merge It", E, "Written exercise: exact commands."), P("Resolve A Merge Conflict", M, "Written exercise showing a conflict marker block."))),
    Topic("git_remote", "Remotes & Pull Requests", 1.2, 3, "origin, push/pull/fetch, forks, pull requests, code review etiquette.",
          (P("Contribute To An Open-Source Repo", M, "Written exercise: steps."), P("Fetch vs Pull", E, "Written exercise."))),
    Topic("git_undo", "Undoing Things Safely", 1.2, 4, "restore, reset (soft/mixed/hard), revert, amend, reflog as a safety net, stash.",
          (P("Undo The Last Commit", E, "Written exercise: exact commands."), P("Recover A Deleted Branch With Reflog", M, "Written exercise."))),
    Topic("git_flow", "Team Workflows", 0.9, 5, "Trunk-based vs GitFlow, tags and releases, protected branches, CI basics.",
          (P("Choose A Branching Strategy", M, "Written exercise."),)),
), note="Exercises are written answers (commands + reasoning) reviewed by the AI.")

WEB = Subject("web", "HTML & CSS", "web", "Build and style web pages from scratch.", "Programming", "exercise", False, (
    Topic("web_html", "HTML Structure", 1.0, 1, "Document skeleton, headings, paragraphs, links, images, lists, semantic elements, accessibility basics (alt text, labels).",
          (P("Write A Personal Profile Page", E, "Written exercise: the learner writes the HTML in the answer box."), P("Mark Up A Blog Post Semantically", E, "Written exercise."))),
    Topic("web_forms", "Forms & Tables", 0.8, 2, "form, input types, label, select, textarea, buttons, validation attributes, tables.",
          (P("Build A Sign-Up Form", E, "Written exercise: HTML in the answer box."), P("Build A Timetable Table", E, "Written exercise."))),
    Topic("web_css", "CSS Basics & the Box Model", 1.3, 3, "Selectors, specificity, colours, typography, the box model (margin/border/padding), display, position.",
          (P("Style A Card Component", E, "Written exercise: CSS in the answer box."), P("Fix A Specificity Problem", M, "Written exercise."))),
    Topic("web_flex", "Flexbox", 1.3, 4, "flex container and items, main vs cross axis, justify/align, gap, wrapping.",
          (P("Centre A Div Both Ways", E, "Written exercise: CSS."), P("Build A Navigation Bar", M, "Written exercise: HTML + CSS."))),
    Topic("web_grid", "Grid & Responsive Design", 1.3, 5, "CSS Grid, media queries, mobile-first, fluid units (rem, %, vw), responsive images.",
          (P("Build A Responsive Photo Gallery", M, "Written exercise: CSS."), P("Make A Layout Mobile First", M, "Written exercise."))),
), note="You write the HTML/CSS as your answer and the AI reviews it (it is not rendered or executed).")

DSA_SUBJECT = Subject("dsa", "Data Structures & Algorithms", "account_tree", "Arrays to dynamic programming — the interview classic.", "Programming", "dsa", True,
                      DSA, language=None, has_placement=True)

SUBJECTS: tuple[Subject, ...] = (DSA_SUBJECT, PYTHON, SQL, EXCEL, JAVASCRIPT, POWERBI, TABLEAU, STATS, ML, GIT, WEB)
BY_KEY: dict[str, Subject] = {s.key: s for s in SUBJECTS}


def get(key: str) -> Optional[Subject]:
    return BY_KEY.get(key)


# ───────────────────────── custom subjects ─────────────────────────
_CTRL = re.compile(r"[\x00-\x1f\x7f]")


def clean_text(s: str, n: int) -> str:
    """Single-line, control-character-free, length-capped text (custom subject data is untrusted)."""
    return re.sub(r"\s+", " ", _CTRL.sub(" ", s or "")).strip()[:n]


def _slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")[:24] or "t"


def custom_subject(name: str, topics: list[dict], practice: str = "exercise") -> Subject:
    """Build a Subject from a (reviewed) outline. ``topics`` = [{name, theory, exercises:[{title, difficulty}]}]."""
    name = clean_text(name, 60)
    out: list[Topic] = []
    seen: set[str] = set()
    for i, t in enumerate(topics[:12]):
        tname = clean_text(str(t.get("name", "")), 70)
        if not tname:
            continue
        key = f"c{i + 1}_{_slug(tname)}"
        if key in seen:
            continue
        seen.add(key)
        probs: list[Problem] = []
        for ex in (t.get("exercises") or [])[:5]:
            title = clean_text(str(ex.get("title", "")) if isinstance(ex, dict) else str(ex), 90)
            diff = ex.get("difficulty") if isinstance(ex, dict) else None
            if title:
                probs.append(Problem(title, diff if diff in (E, M, H) else M,
                                     "Written exercise reviewed by an AI tutor; state the scenario and any sample data in prompt_context."))
        if not probs:
            probs = [Problem(f"{tname}: Practice Exercise", M, "Written exercise reviewed by an AI tutor.")]
        out.append(Topic(key, tname, 1.0, i + 1, clean_text(str(t.get("theory", "")), 400) or f"The key ideas of {tname}.", tuple(probs)))
    return Subject(key="custom", name=name, icon="auto_awesome", blurb="Your own subject", group="Custom", kind="exercise",
                   featured=False, topics=tuple(out), custom=True,
                   note="AI-generated roadmap — not reviewed by a human. Check anything important against an official source.")


def catalog_out(s: Subject) -> dict:
    return {
        "key": s.key, "name": s.name, "icon": s.icon, "blurb": s.blurb, "group": s.group, "kind": s.kind,
        "featured": s.featured, "language": s.language, "note": s.note, "has_placement": s.has_placement,
        "executable": s.kind in ("dsa", "code", "sql"),
        "topics": [{"key": t.key, "name": t.name, "exercises": len(t.problems), "weight": t.weight} for t in s.topics],
    }
