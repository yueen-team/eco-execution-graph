Feature: Knowledge governance layer
  The knowledge governance layer keeps document governance separate from graph semantics
  so RAG remains the full-text source, the graph remains a thin semantic source, and
  expert agent Xiaoyue, EcoCheck, and EcoCheck health-report EcoDoc worker consume ETO-approved graph context through machine-gated publication bundles.

  Scenario: Knowledge documents keep only safe metadata
    Given RAG citation metadata contains document titles, locators, and rag_doc_ref values
    When the knowledge document registry is built
    Then each document keeps doc_id, doc_type, title, canonical_title, rag_doc_ref, content_hash, metadata_hash, effective_status, dedupe_group_id, review_status, and trace
    And RAG Content or legal full text is not written into the registry

  Scenario: Source-level locators become governance candidates
    Given a RAG citation remains source-level because article, standard, page, and section metadata are missing
    When governance candidates are generated
    Then a locator_patch candidate is created
    And the candidate review_status is candidate
    And it cannot be published as an official legal basis

  Scenario: Graph feedback never auto-promotes law knowledge
    Given graph context contains field experience, rectification advice, issue types, or report expressions
    When governance candidates are generated
    Then graph feedback is represented as graph_expert_candidate or legal_mapping_review
    And it is not written to the legal or technical-standard full-text knowledge base
    And it requires ETO graph approval before publication
    And publication itself is machine-gated without a second human review

  Scenario: Deprecated or superseded documents are blocked from runtime publication
    Given a knowledge document is deprecated or superseded
    When publication bundles are built for expert_agent, ecocheck, or ecodoc
    Then that document is listed in blocked_items
    And it is not listed as an official publication item

  Scenario: Consumer bundles are traceable and reviewed
    Given approved or human_reviewed knowledge documents exist
    When publication bundles are built
    Then each published item includes trace, source_ref, legal_basis_status, review_status, and rag_doc_ref
    And candidate, disputed, or no_legal_basis items are not expressed as confirmed legal requirements

  Scenario: ETO-approved graph knowledge is published by machine gate
    Given a graph node or edge is approved or human_reviewed by ETO
    When expert_agent, ecocheck, or ecodoc asks for graph context
    Then no second human review is required
    And approval_basis is ETO_APPROVED_IN_GRAPH
    And human_review_required is false
    And the machine gate checks tier, legal_basis_status, rag_doc_ref, locator specificity, and trace
    And failing law or technical-standard refs are returned as blocked_refs

  Scenario: Graph context API returns slim legal and technical refs
    Given an approved issue_type is connected to law_article and tech_spec nodes
    When /api/graph/context is called for that issue_type
    Then the response includes approval_basis, human_review_required, machine_gate_status, graph_context, law_refs, tech_spec_refs, blocked_refs, and trace
    And law_refs and tech_spec_refs contain slim citation metadata only
    And RAG Content or legal full text is not returned

  Scenario: The governance layer remains offline in v1
    Given the governance pipeline runs
    When registry, candidates, and publication bundles are written
    Then no Tencent RAG document management API is called
    And no EcoCheck production database is written
    And the generated reports describe the offline publication boundary
