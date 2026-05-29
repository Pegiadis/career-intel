from config import settings

try:
    from langfuse import Langfuse
    _lf = (Langfuse(public_key=settings.langfuse_public_key,
                    secret_key=settings.langfuse_secret_key, host=settings.langfuse_host)
           if settings.langfuse_secret_key else None)
except Exception:
    _lf = None


def trace_query(name: str, **kw):
    if _lf:
        _lf.trace(name=name, metadata=kw)
