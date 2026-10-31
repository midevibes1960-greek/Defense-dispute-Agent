# Evidence pack (v1)
Map dispute reason -> PayPal evidence_type:
- MERCHANDISE_OR_SERVICE_NOT_RECEIVED -> PROOF_OF_FULFILLMENT (carrier_name + tracking_number) + OTHER notes
- MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED -> OTHER (listing text, item URL, return policy) + optional PROOF_OF_REFUND
- UNAUTHORISED -> PROOF_OF_FULFILLMENT + OTHER
- CREDIT_NOT_PROCESSED -> PROOF_OF_REFUND (refund_ids)
Never invent tracking numbers or refund IDs. If missing, mark checklist item done=false and tell seller what to add.
