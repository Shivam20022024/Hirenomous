import os
import requests
import json
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger("hirenomous-plivo-provider")

class PlivoProvider:
    """
    Direct Plivo Telephony Provider for Hirenomous.
    Allows companies to make and receive calls with dedicated Plivo numbers,
    bypassing intermediary platforms and ensuring guaranteed Caller ID.
    """
    
    BASE_API_URL = "https://api.plivo.com/v1/Account"
    
    def __init__(self, auth_id: str, auth_token: str, default_from: Optional[str] = None):
        self.auth_id = (auth_id or "").strip()
        self.auth_token = (auth_token or "").strip()
        self.default_from = default_from
        self.auth = (self.auth_id, self.auth_token)

    def is_valid(self) -> bool:
        return bool(self.auth_id and self.auth_token)

    async def verify_credentials(self) -> Dict[str, Any]:
        """Verify the Plivo Auth ID and Auth Token against Plivo's Account API."""
        if not self.is_valid():
            return {"valid": False, "error": "Missing Auth ID or Auth Token"}
        try:
            url = f"{self.BASE_API_URL}/{self.auth_id}/"
            resp = requests.get(url, auth=self.auth, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "valid": True,
                    "account_name": data.get("name"),
                    "cash_credits": data.get("cash_credits"),
                    "account_type": data.get("account_type")
                }
            return {"valid": False, "error": f"Plivo error {resp.status_code}: {resp.text}"}
        except Exception as e:
            logger.error(f"Failed to verify Plivo credentials: {e}")
            return {"valid": False, "error": str(e)}

    async def list_owned_numbers(self) -> List[Dict[str, Any]]:
        """List phone numbers owned by this Plivo account."""
        url = f"{self.BASE_API_URL}/{self.auth_id}/Number/"
        try:
            resp = requests.get(url, auth=self.auth, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("objects", [])
            return []
        except Exception as e:
            logger.error(f"Failed to list Plivo numbers: {e}")
            return []

    async def search_numbers(self, country_iso: str = "IN", city: Optional[str] = None, limit: int = 10) -> List[Dict[str, Any]]:
        """Search available phone numbers to buy/rent."""
        url = f"{self.BASE_API_URL}/{self.auth_id}/PhoneNumber/"
        params = {
            "country_iso": country_iso.upper(),
            "type": "local",
            "limit": limit
        }
        if city:
            params["region"] = city
        try:
            resp = requests.get(url, auth=self.auth, params=params, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("objects", [])
            return []
        except Exception as e:
            logger.error(f"Failed to search Plivo numbers: {e}")
            return []

    async def buy_number(self, phone_number: str, app_id: Optional[str] = None) -> Dict[str, Any]:
        """Buy/rent a phone number on Plivo."""
        clean_num = phone_number.replace("+", "").replace(" ", "").replace("-", "")
        url = f"{self.BASE_API_URL}/{self.auth_id}/PhoneNumber/{clean_num}/"
        payload = {}
        if app_id:
            payload["app_id"] = app_id
        try:
            resp = requests.post(url, auth=self.auth, json=payload, timeout=15)
            if resp.status_code in (200, 201):
                return {"status": "success", "data": resp.json()}
            return {"status": "error", "error": resp.text}
        except Exception as e:
            logger.error(f"Failed to buy Plivo number {clean_num}: {e}")
            return {"status": "error", "error": str(e)}

    async def trigger_outbound_call(
        self,
        to_phone_number: str,
        lead_id: str,
        company_id: str,
        from_phone_number: Optional[str] = None,
        base_url: str = "",
        extra_user_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Trigger an outbound call using Plivo REST API.
        The caller ID is strictly guaranteed to be the company's Plivo number.
        """
        caller_id = (from_phone_number or self.default_from or "").replace(" ", "").replace("-", "")
        if not caller_id:
            raise ValueError("No caller phone number configured for Plivo outbound call")

        # Format numbers to guarantee correct country code routing
        caller_id_clean = "".join(filter(str.isdigit, str(caller_id)))
        to_clean = "".join(filter(str.isdigit, str(to_phone_number)))
        
        # If Indian mobile number without 91 prefix, auto-prefix 91
        if len(to_clean) == 10:
            to_clean = f"91{to_clean}"
        elif len(to_clean) == 11 and to_clean.startswith("0"):
            to_clean = f"91{to_clean[1:]}"

        url = f"{self.BASE_API_URL}/{self.auth_id}/Call/"
        
        clean_base = base_url.rstrip("/") if base_url else ""
        answer_url = f"{clean_base}/api/v1/plivo/answer?call_id={lead_id}&company_id={company_id}"
        hangup_url = f"{clean_base}/api/v1/plivo/hangup?call_id={lead_id}&company_id={company_id}"

        payload = {
            "from": caller_id_clean,
            "to": to_clean,
            "answer_url": answer_url,
            "answer_method": "POST",
            "hangup_url": hangup_url,
            "hangup_method": "POST"
        }

        logger.info(f"Originating Plivo call from {caller_id_clean} to {to_clean} via answer_url: {answer_url}")
        
        resp = requests.post(url, auth=self.auth, json=payload, timeout=15)
        if resp.status_code in (200, 201, 202):
            call_data = resp.json()
            return {
                "status": "success",
                "provider": "plivo",
                "call_id": lead_id,
                "plivo_request_uuid": call_data.get("request_uuid"),
                "caller_id": f"+{caller_id_clean}",
                "recipient": f"+{to_clean}",
                "message": call_data.get("message", "Call initiated successfully")
            }
        else:
            logger.error(f"Plivo outbound call failed: {resp.status_code} - {resp.text}")
            raise RuntimeError(f"Plivo Error ({resp.status_code}): {resp.text}")

    async def hangup_call(self, call_uuid: str) -> bool:
        """
        Terminate an active call using Plivo REST API.
        """
        if not call_uuid:
            return False
        url = f"{self.BASE_API_URL}/{self.auth_id}/Call/{call_uuid}/"
        try:
            logger.info(f"Hanging up Plivo call {call_uuid} via REST API")
            resp = requests.delete(url, auth=self.auth, timeout=10)
            if resp.status_code in (200, 204):
                logger.info(f"Plivo call {call_uuid} successfully terminated.")
                return True
            else:
                logger.warning(f"Plivo hangup status: {resp.status_code} - {resp.text}")
                return False
        except Exception as e:
            logger.error(f"Error hanging up Plivo call {call_uuid}: {e}")
            return False

