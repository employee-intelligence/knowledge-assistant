import re

# Lightweight intent check: greetings, thanks, and conversational follow-ups
# are NOT policy questions. Sending them through retrieval forces the
# "couldn't find that in the company documents" fallback on casual chat,
# which makes for a bad first impression. This mirrors guard.py's approach:
# regex heuristics, no extra LLM call, no added latency.

# Meta questions about the assistant itself — conversational, not policy lookups.
META_PATTERNS = [
    r"^\s*(who are you|what are you|what can you do|what do you do|help)\b",
    r"^\s*(what|who)\b.*\b(can you do|do you do|are you|your purpose|your name)\b",
]

# Follow-up style phrases ("anything else I can know?", "tell me more") are
# conversational UNLESS they also name a policy topic — "anything else about
# leave?" is probably a real follow-up lookup and must stay on the RAG path.
FOLLOWUP_PATTERNS = [
    r"^anything\s+(else|more)\b",
    r"^what\s+else\b",
    r"^tell\s+me\s+more\b",
    r"^more\s+(info|information|details|about)\b",
]

# Named policy topics — used to veto misclassifying a real lookup as chat.
POLICY_KEYWORDS = re.compile(
    r"\b(leave|salary|payslip|pay\s?roll|vpn|onboarding|policy|policies|benefit|"
    r"pension|appraisal|contract|holiday|overtime|bonus|tax|probation|resign\w*|"
    r"disciplinary|grievance|maternity|paternity|equipment|laptop|wifi|badge|"
    r"access|security|phishing|raise|promotion|pets?|world cup)\b",
    re.IGNORECASE,
)

# Signals of a real policy question, even in a short message. Any match keeps
# the message on the RAG path so "never guess policy facts" still holds.
QUESTION_HINTS = re.compile(
    r"\b(how|what|where|when|who|which|why|can|could|do|does|did|is|are|am|will|should)\b"
    r"|" + POLICY_KEYWORDS.pattern,
    re.IGNORECASE,
)

_CHIT_CHAT = "ok|okay|cool|great|nice|perfect|awesome|got it|understood|sure|alright|wow|lol|yes|yeah|yep|yup|no|nope|nah|thanks|thank you|thx|ty|cheers|bye|goodbye|see you|see ya"

SMALLTALK_PATTERNS = [
    r"^(hi|hello|hey|hiya|howdy|yo|sup|greetings|good (morning|afternoon|evening))[\s!.,]*$",
    r"^(hi|hello|hey|hiya)[,.\s]+(there|everyone|team)[\s!.,]*$",
    # one or more chit-chat words, e.g. "ok", "ok cool", "thanks a lot" is NOT this
    rf"^(({_CHIT_CHAT})[\s!.,]*)+$",
    r"^(anything else|any other|what else|tell me more|more info|more information|"
    r"and more|anything more|what now|so\?|and\?|then\?)[\s!.?,]*$",
]


def is_conversational(question: str) -> bool:
    q = question.strip().lower()
    if not q:
        return True
    # Meta questions about the assistant itself come first — "what can you do?"
    # contains "what" (a question hint) but is not a policy lookup.
    if any(re.search(p, q) for p in META_PATTERNS):
        return True
    # Bare follow-up phrases ("anything else I can know?") are conversational,
    # but if the message names a policy topic it stays on the RAG path.
    if any(re.search(p, q) for p in FOLLOWUP_PATTERNS) and not POLICY_KEYWORDS.search(q):
        return True
    # Real question signals always win — this protects the grounding rule.
    if QUESTION_HINTS.search(q):
        return False
    return any(re.search(p, q) for p in SMALLTALK_PATTERNS)
