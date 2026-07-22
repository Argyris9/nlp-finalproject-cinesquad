"""Text normalization shared by the notebook and the sentiment pipeline.

Lives in an importable module — NOT the notebook — because joblib pickles only
a REFERENCE to a function. The backend process must be able to import it by name
when it loads sentiment_model.joblib.
"""
import re
from functools import lru_cache
from nltk.stem import PorterStemmer, WordNetLemmatizer
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS

# ---- everything below is copied verbatim from the notebook ----
negations    = {"not", "no", "never", "nor"}
custom_stops = set(ENGLISH_STOP_WORDS) - negations
lemmatizer   = WordNetLemmatizer()
stemmer      = PorterStemmer()

@lru_cache(maxsize=200_000)
def cached_stem(token):
    return stemmer.stem(token)

CONTRACTIONS = [
    (re.compile(r"\bcan't\b", re.IGNORECASE), "can not"),
    (re.compile(r"\bwon't\b", re.IGNORECASE), "will not"),
    (re.compile(r"n't\b",     re.IGNORECASE), " not"),
]

RE_HTML     = re.compile(r"<.*?>")
RE_URL      = re.compile(r"https?://\S+|www\.\S+")
RE_HANDLE   = re.compile(r"@\w+|#\w+")
RE_REPEAT   = re.compile(r"(.)\1{2,}")
RE_NONALPHA = re.compile(r"[^a-z\s]")


def advanced_normalize_text(text, mode="stem"):
    """mode: "none" | "stem" | "lemma". Returns a STRING."""
    if not isinstance(text, str):
        return ""

    text = RE_HTML.sub(" ", text)
    text = RE_URL.sub(" ", text)
    text = RE_HANDLE.sub(" ", text)
    text = text.encode("ascii", "ignore").decode("ascii")

    for pat, repl in CONTRACTIONS:
        text = pat.sub(repl, text)

    text = RE_REPEAT.sub(r"\1", text)
    text = text.lower()
    text = RE_NONALPHA.sub(" ", text)

    cleaned = []
    for token in text.split():
        if token in custom_stops or len(token) <= 1:
            continue
        if mode == "stem":
            token = cached_stem(token)
        elif mode == "lemma":
            token = lemmatizer.lemmatize(token)
        cleaned.append(token)

    return " ".join(cleaned)
# ---- end verbatim copy ----


def normalize_batch(texts):
    """Module-level (not a lambda) so joblib can pickle a reference to it.
    This is the pipeline's first step: raw text in, stemmed text out."""
    return [advanced_normalize_text(t, mode="stem") for t in texts]

def normalize_plain(text):
    """Single string, mode='none' -- the topic model's vocabulary is unstemmed.
    Passed to TfidfVectorizer(preprocessor=...), which calls it per-document,
    so this takes one string and returns one string (unlike normalize_batch)."""
    return advanced_normalize_text(text, mode="none")    