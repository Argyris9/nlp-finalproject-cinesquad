"""Shared LLM generator, used by both the single-user RAG chatbot
(rag_service.py) and the session-grounded group chat (group_chat_service.py)
-- loaded once and reused, instead of each service holding its own model.

Two backends:
- Gemini (free tier), used whenever GEMINI_API_KEY is set -- much better
  answer quality than the local fallback.
- A local, free, no-API-key flan-t5-base model. This is the *only* backend
  when GEMINI_API_KEY isn't set, and it's also an automatic safety net when
  Gemini is configured but fails for any reason (rate limit, quota, network
  blip, transient server error): the free tier is quite easy to exhaust in
  practice (as low as 20 requests/day per model on some keys), and a chat
  feature that just 500s the moment that happens is a bad experience. Better
  to transparently drop to a lower-quality answer than to give no answer.
"""

from __future__ import annotations

import logging
import os

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip()
# gemini-2.0-flash currently has a hard 0 free-tier quota on some new API
# keys/projects (confirmed by testing) -- gemini-2.5-flash and
# gemini-flash-latest both work on the free tier, so that's the default.
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
FALLBACK_MODEL = "google/flan-t5-base"

# flan-t5-base is a small model that gets confused by (and often just
# echoes back verbatim) the longer, structured, characterful system
# prompts written for Gemini -- it needs a short, plain, single-sentence
# instruction instead. Deliberately NOT shared with the Gemini path.
_LOCAL_FALLBACK_INSTRUCTION = (
    "Answer the question in one complete sentence, using only the movie "
    "information below. If the answer isn't in the information, say you don't know."
)

USING_GEMINI = bool(GEMINI_API_KEY)

_gemini_client = None
_local_tokenizer = None
_local_model = None

if USING_GEMINI:
    from google import genai
    from google.genai import types as genai_types

    _gemini_client = genai.Client(api_key=GEMINI_API_KEY)


def _ensure_local_model() -> None:
    """Lazily loads the local model -- eagerly at startup if Gemini isn't
    configured at all (it's the only option), or on-demand the first time
    Gemini actually fails (so a working Gemini setup never pays the ~1GB
    load cost for a fallback it ends up not needing)."""
    global _local_tokenizer, _local_model
    if _local_model is not None:
        return
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    _local_tokenizer = AutoTokenizer.from_pretrained(FALLBACK_MODEL)
    _local_model = AutoModelForSeq2SeqLM.from_pretrained(FALLBACK_MODEL)


if not USING_GEMINI:
    _ensure_local_model()


def _generate_gemini(prompt: str, system_instruction: str | None, max_new_tokens: int) -> str:
    # Gemini 2.5 models spend part of max_output_tokens on internal
    # "thinking" tokens by default, which can silently truncate the
    # visible answer for a low token budget. This is a short, direct
    # Q&A/explanation task with no need for extended reasoning, so
    # thinking is disabled outright (also faster and cheaper).
    response = _gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            max_output_tokens=max_new_tokens,
            temperature=0.4,
            thinking_config=genai_types.ThinkingConfig(thinking_budget=0),
            system_instruction=system_instruction,
        ),
    )
    text = (response.text or "").strip()
    if text:
        return text
    # Gemini can return an empty candidate (e.g. blocked by safety filters
    # on an edge-case prompt) -- surface a clear fallback instead of "".
    return "I don't have a good answer for that based on the available movie information."


def _generate_local(prompt: str, max_new_tokens: int, min_new_tokens: int) -> str:
    # flan-t5-base has no system/user role distinction (unlike Gemini) --
    # the closest equivalent is prepending a short instruction to the same
    # flat input string. Uses _LOCAL_FALLBACK_INSTRUCTION, not whatever
    # system_instruction the caller passed (see module docstring above).
    full_prompt = f"{_LOCAL_FALLBACK_INSTRUCTION}\n\n{prompt}"
    inputs = _local_tokenizer(full_prompt, return_tensors="pt", truncation=True, max_length=768)
    output_ids = _local_model.generate(
        **inputs,
        max_new_tokens=max_new_tokens,
        min_new_tokens=min_new_tokens,
        num_beams=4,
        no_repeat_ngram_size=3,
    )
    return _local_tokenizer.decode(output_ids[0], skip_special_tokens=True)


def generate(
    prompt: str,
    system_instruction: str | None = None,
    max_new_tokens: int = 150,
    min_new_tokens: int = 12,
) -> str:
    """`system_instruction` is the persistent persona/rules (kept separate
    from and weighted more heavily than the user content on Gemini, the
    same concept as OpenAI's system message); `prompt` is the actual
    per-request content (retrieved context + question)."""
    if USING_GEMINI:
        try:
            return _generate_gemini(prompt, system_instruction, max_new_tokens)
        except Exception:
            logger.warning("Gemini generation failed, falling back to local flan-t5-base for this request", exc_info=True)
            _ensure_local_model()
    return _generate_local(prompt, max_new_tokens, min_new_tokens)
