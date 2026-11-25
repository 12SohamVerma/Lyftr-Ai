"""Lyftr AI backend: FastAPI + LiteLLM chat service with key failover and response caching."""

import os

# Must run before LiteLLM is imported anywhere:
# * LITELLM_MODE=PRODUCTION stops LiteLLM from calling load_dotenv() on import,
#   which would otherwise pull a stray .env into os.environ behind our back.
#   All configuration goes through app.config.Settings instead.
# * LITELLM_LOCAL_MODEL_COST_MAP uses the bundled model map instead of
#   downloading it from GitHub at startup (faster, works offline).
os.environ.setdefault("LITELLM_MODE", "PRODUCTION")
os.environ.setdefault("LITELLM_LOCAL_MODEL_COST_MAP", "True")
