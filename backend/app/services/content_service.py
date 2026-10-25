"""Authoring workspace content for a block, with a cross-user cache for curriculum lessons/problems."""
from __future__ import annotations

import logging

from pymongo.errors import DuplicateKeyError

from app.models.learning import ContentCache
from app.models.schemas import TaskContent, testcases_to_docs
from app.models.task import TaskBlock
from app.models.user import User
from app.services.ai_evaluator import GeneratedContent, get_evaluator

log = logging.getLogger("agama.content")


def apply_content(task: TaskBlock, c: TaskContent, reference: str = "") -> None:
    task.prompt_context = c.prompt_context
    task.constraints, task.hints, task.checklist = c.constraints, c.hints, c.checklist
    task.starter_code, task.test_cases = c.starter_code, testcases_to_docs(c.test_cases)
    task.word_target_min, task.word_target_max, task.target_wpm = c.word_target_min, c.word_target_max, c.target_wpm
    task.description = c.description or task.description
    task.difficulty = c.difficulty or task.difficulty
    task.tags = c.tags or task.tags
    task.reference_solution = reference
    task.content_ready = True
    task.draft = None
    task.hint_level_used = 0


async def author_block(task: TaskBlock, user: User, instructions: str = "") -> TaskBlock:
    """Fill ``task`` with AI-authored content (or a cached copy for curriculum blocks) and save it."""
    use_cache = bool(task.cache_key) and not instructions.strip()
    if use_cache:
        hit = await ContentCache.find_one(ContentCache.key == task.cache_key)
        if hit is not None:
            try:
                g = GeneratedContent(**hit.payload)
                apply_content(task, g, g.reference_solution)
                hit.hits += 1
                await hit.save()
                await task.save()
                return task
            except Exception:                     # corrupt cache entry → regenerate and overwrite below
                log.warning("Ignoring unusable cache entry %s", task.cache_key)
                await hit.delete()

    g = await get_evaluator().generate_content(
        title=task.title, mode=task.task_mode, category=task.category, language=task.language,
        duration_minutes=task.duration_minutes, instructions=instructions, gen_hint=task.gen_hint,
        model=user.preferences.ai_model,
    )
    apply_content(task, g, g.reference_solution)
    await task.save()
    if use_cache:
        try:
            await ContentCache(key=task.cache_key, payload=g.model_dump()).insert()
        except DuplicateKeyError:
            pass
        except Exception as e:                    # caching must never break authoring
            log.warning("Could not cache %s: %s", task.cache_key, e)
    return task
