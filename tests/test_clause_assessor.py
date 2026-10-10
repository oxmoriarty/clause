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
        "material_risk_anchors": [{"category": "termination", "clause_reference": "Clause 12"}],
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
        "material_risk_anchors": [{"category": "liability", "clause_reference": "10"}],
    },
}
NEARLY_AGREEING_ASSESSMENT = {
    "conclusion": "attention_required",
    "findings": [
        {
            "id": "termination-12",
            "category": "termination",
            "severity": "moderate",
            "clause_reference": "12",
            "summary": "Immediate termination can leave no cure opportunity.",
            "question": "Which breaches permit this remedy and is there a cure period?",
        }
    ],
    "missing_context": [],
    "uncertainty": [],
    "consensus_core": {
        "overall_conclusion": "attention_required",
        "highest_severity": "moderate",
        "material_risk_categories": ["termination"],
        "material_risk_anchors": [{"category": "termination", "clause_reference": "12"}],
    },
}
BROADER_BUT_AGREEING_ASSESSMENT = {
    "conclusion": "attention_required",
    "findings": [
        {
            "id": "termination-12",
            "category": "termination",
            "severity": "high",
            "clause_reference": "12",
            "summary": "Immediate termination can leave no cure opportunity.",
            "question": "Which breaches permit this remedy and is there a cure period?",
        },
        {
            "id": "liability-10",
            "category": "liability",
            "severity": "moderate",
            "clause_reference": "10",
            "summary": "The liability wording is broad.",
            "question": "Can the exposure be capped?",
        },
        {
            "id": "scope-missing",
            "category": "scope",
            "severity": "moderate",
            "clause_reference": "Agreement",
            "summary": "The agreement does not define the service scope.",
            "question": "Can the deliverables and responsibilities be defined?",
        },
    ],
    "missing_context": [],
    "uncertainty": [],
    "consensus_core": {
        "overall_conclusion": "attention_required",
        "highest_severity": "high",
        "material_risk_categories": ["termination", "liability", "scope"],
        "material_risk_anchors": [
            {"category": "termination", "clause_reference": "12"},
            {"category": "liability", "clause_reference": "10"},
            {"category": "scope", "clause_reference": "Agreement"},
        ],
    },
}
SAME_CATEGORY_DIFFERENT_CLAUSE_ASSESSMENT = {
    "conclusion": "attention_required",
    "findings": [
        {
            "id": "termination-3",
            "category": "termination",
            "severity": "high",
            "clause_reference": "3",
            "summary": "The termination clause has no cure opportunity.",
            "question": "Can the termination remedy include a cure period?",
        }
    ],
    "missing_context": [],
    "uncertainty": [],
    "consensus_core": {
        "overall_conclusion": "attention_required",
        "highest_severity": "high",
        "material_risk_categories": ["termination"],
        "material_risk_anchors": [{"category": "termination", "clause_reference": "3"}],
    },
}


def mock_assessment(direct_vm, assessment=ASSESSMENT, semantic_accept=True):
    direct_vm.mock_llm(r".*global contract-risk assessor.*", json.dumps(assessment))
    direct_vm.mock_llm(r".*strict semantic comparator.*", json.dumps({"accept": semantic_accept}))


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


def test_records_the_redacted_contract_and_report_under_the_submitter_wallet(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    owner = contract.assessment_owners.get("1", "")
    summaries = json.loads(contract.get_assessment_summaries_for_wallet(owner))
    record = json.loads(contract.get_assessment_for_wallet(owner, "1"))

    assert len(summaries) == 1
    assert summaries[0]["assessment_id"] == "1"
    assert summaries[0]["title"] == "CONSULTING SERVICES AGREEMENT"
    assert summaries[0]["finding_count"] == 1
    assert record["contract_text"] == CONTRACT_TEXT
    assert record["report"] == expected_report("1")
    assert json.loads(contract.get_assessment_summaries_for_wallet(owner.upper())) == summaries
    assert json.loads(contract.get_assessment_for_wallet(owner.upper(), "1")) == record
    assert contract.get_assessment_for_wallet("0x" + "1" * 40, "1") == ""


def test_validator_rejects_a_materially_different_assessment(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    direct_vm.clear_mocks()
    mock_assessment(direct_vm, DISAGREEING_ASSESSMENT)

    assert direct_vm.run_validator() is False


def test_validator_accepts_the_same_material_risk_one_severity_band_apart(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    direct_vm.clear_mocks()
    mock_assessment(direct_vm, NEARLY_AGREEING_ASSESSMENT)

    assert direct_vm.run_validator() is True


def test_validator_accepts_one_shared_risk_when_its_report_is_broader(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    direct_vm.clear_mocks()
    mock_assessment(direct_vm, BROADER_BUT_AGREEING_ASSESSMENT)

    assert direct_vm.run_validator() is True


def test_validator_rejects_the_same_category_at_a_different_clause(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    direct_vm.clear_mocks()
    mock_assessment(direct_vm, SAME_CATEGORY_DIFFERENT_CLAUSE_ASSESSMENT)

    assert direct_vm.run_validator() is False


def test_validator_rejects_when_the_semantic_comparison_rejects(direct_vm, direct_deploy):
    mock_assessment(direct_vm)
    contract = direct_deploy(CONTRACT_PATH)
    contract.assess_contract(CONTRACT_TEXT)

    direct_vm.clear_mocks()
    mock_assessment(direct_vm, ASSESSMENT, semantic_accept=False)

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
