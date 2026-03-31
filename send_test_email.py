#!/usr/bin/env python3
"""
Teste local de envio com Resend.

Configure o dominio/remetente no painel da Resend:
https://resend.com/domains

EMAIL_FROM precisa ser um remetente valido na sua conta Resend;
caso contrario a API pode recusar o envio com erro 403/422.
"""

from __future__ import annotations

import os
import sys

from dotenv import load_dotenv
import requests


RESEND_API_URL = "https://api.resend.com/emails"
TEST_TO = "diegoejack97@gmail.com"
CONTROL_FROM = "onboarding@resend.dev"


def validate_env() -> tuple[str, str]:
    resend_api_key = (os.getenv("RESEND_API_KEY") or "").strip()
    email_from = (os.getenv("EMAIL_FROM") or "").strip()

    if not resend_api_key:
        print("Falha ao enviar email")
        print("RESEND_API_KEY nao configurada no .env")
        raise SystemExit(1)

    if not email_from:
        print("Falha ao enviar email")
        print("EMAIL_FROM nao configurado no .env")
        raise SystemExit(1)

    return resend_api_key, email_from


def send_with_resend(*, api_key: str, email_from: str, label: str) -> dict:
    payload = {
        "from": email_from,
        "to": [TEST_TO],
        "subject": "Teste Resend",
        "html": "<strong>Teste funcionando</strong>",
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print(f"\n=== {label} ===")
    print(f"from: {email_from}")
    print(f"to: {TEST_TO}")

    try:
        response = requests.post(
            RESEND_API_URL,
            json=payload,
            headers=headers,
            timeout=15,
        )
    except Exception as exc:
        print("Falha ao enviar email")
        print(f"erro de rede/execucao: {exc}")
        return {
            "ok": False,
            "status_code": None,
            "body": str(exc),
            "json": None,
        }

    body_text = response.text
    try:
        body_json = response.json()
    except Exception:
        body_json = None

    print(f"status code: {response.status_code}")
    if body_json is not None:
        print(f"response json: {body_json}")
    else:
        print(f"response body: {body_text}")

    if response.ok:
        print("Email enviado com sucesso")
        if isinstance(body_json, dict):
            print(f"response id: {body_json.get('id')}")
    else:
        print("Falha ao enviar email")

    return {
        "ok": response.ok,
        "status_code": response.status_code,
        "body": body_text,
        "json": body_json,
    }

def print_diagnosis(control_result: dict, real_result: dict) -> int:
    print("\n=== DIAGNOSTICO AUTOMATICO ===")

    if control_result["ok"] and real_result["ok"]:
        print("SUCESSO: sistema configurado corretamente")
        return 0

    if control_result["ok"] and not real_result["ok"]:
        print("PROBLEMA: dominio nao verificado no Resend")
        print("Valide o dominio no painel do Resend e configure SPF e DKIM.")
        print("Sem SPF e DKIM, o remetente do seu dominio pode ser recusado.")
        return 1

    print("PROBLEMA: API Key ou codigo incorreto")
    print("Se o teste com onboarding@resend.dev tambem falhou, revise RESEND_API_KEY, conectividade e payload.")
    return 1


def main() -> int:
    load_dotenv()

    resend_api_key, email_from = validate_env()

    control_result = send_with_resend(
        api_key=resend_api_key,
        email_from=CONTROL_FROM,
        label="TESTE 1 - CONTROLE",
    )
    real_result = send_with_resend(
        api_key=resend_api_key,
        email_from=email_from,
        label="TESTE 2 - REMETENTE REAL",
    )

    return print_diagnosis(control_result, real_result)


if __name__ == "__main__":
    raise SystemExit(main())
