from __future__ import annotations


def mask_email(email: str | None) -> str:
    raw = (email or "").strip()
    if not raw:
        return "email_ausente"

    if "@" not in raw:
        return "***"

    local_part, domain = raw.split("@", 1)
    masked_local = (
        f"{local_part[0]}***{local_part[-1]}"
        if len(local_part) >= 2
        else f"{local_part[:1]}***"
    )

    if "." in domain:
        domain_name, _, tld = domain.partition(".")
        masked_domain = f"{domain_name[:1]}***.{tld}" if domain_name else f"***.{tld}"
    else:
        masked_domain = f"{domain[:1]}***" if domain else "***"

    return f"{masked_local}@{masked_domain}"
