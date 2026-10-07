import hashlib
import json


CONTRACT_PATH = "contracts/clause_assessor.py"
CONTRACT_TEXT = """
CONSULTING SERVICES AGREEMENT

10. Liability. Consultant shall be liable for all losses, damages, costs and
expenses arising from any breach of this Agreement.

12. Termination. Client may terminate immediately and without notice upon any
breach. This Agreement automatically renews for successive one-year terms
unless either party gives 60 days' notice.
""".strip()
CONTRACT_HASH = hashlib.sha256(CONTRACT_TEXT.encode("utf-8")).hexdigest()
ASSESSMENT = {
    "conclusion": "attention_required",
    "findings": [
        {
            "id": "termination-12",
            "category": "termination",
            "severity": "high",
            "clause_reference": "12",
            "summary": "Immediate termination without notice can leave no cure opportunity.",
            "question": "Which breaches permit this remedy and is there a cure period?",
        }
    ],
    "missing_context": [],
    "uncertainty": [],
    "consensus_core": {
        "overall_conclusion": "attention_required",
        "highest_severity": "high",
        "material_risk_categories": ["termination"],
    },
}
DISAGREEING_ASSESSMENT = {
    "conclusion": "attention_required",
    "findings": [
        {
            "id": "liability-10",
            "category": "liability",
            "severity": "high",
            "clause_reference": "10",
            "summary": "The liability wording is broad.",
            "question": "Can the exposure be capped?",
        }
    ],
    "missing_context": [],
    "uncertainty": [],
    "consensus_core": {
        "overall_conclusion": "attention_required",
        "highest_severity": "high",
        "material_risk_categories": ["liability"],
    },
}


def mock_assessment(direct_vm, assessment=ASSESSMENT):
    direct_vm.mock_llm(r".*global contract-risk assessor.*", json.dumps(assessment))


def expected_report(assessment_id: str):
    return {
        "assessment_id": assessment_id,
        "commitment": f"attention_required:{CONTRACT_HASH}",
        "conclusion": ASSESSMENT["conclusion"],
        "findings": ASSESSMENT["findings"],
        "missing_context": ASSESSMENT["missing_context"],
        "uncertainty": ASSESSMENT["uncertainty"],
    }


def test_returns_serial_assessment_with_findings_and_accepts_agreement(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)

    first = json.loads(contract.assess_contract(CONTRACT_TEXT))
    assert direct_vm.run_validator() is True

    second = json.loads(contract.assess_contract(CONTRACT_TEXT))

    assert first == expected_report("1")
    assert second == expected_report("2")
    assert contract.get_assessment_status("1") == "attention_required"
    assert json.loads(contract.get_assessment_report("1")) == first


def test_validator_rejects_a_materially_different_assessment(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    direct_vm.clear_mocks()
    mock_assessment(direct_vm, DISAGREEING_ASSESSMENT)

    assert direct_vm.run_validator() is False


def test_accepts_a_short_but_meaningful_clause(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)

    result = json.loads(contract.assess_contract("Client may terminate immediately."))

    assert result["assessment_id"] == "1"


def test_rejects_contract_text_under_twenty_characters(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("contract text must contain at least 20 non-whitespace characters"):
        contract.assess_contract("Too short.")


def test_rejects_contract_text_that_is_too_large(direct_vm, direct_deploy):
    contract = direct_deploy(CONTRACT_PATH)

    with direct_vm.expect_revert("contract text exceeds the 50,000 character limit"):
        contract.assess_contract("a" * 50001)
