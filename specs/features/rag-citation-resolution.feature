Feature: RAG citation resolution
  Scenario: RAG citations never write full text into graph nodes
    Given Tencent LKE credentials are configured through environment variables
    When citation resolution runs
    Then real smoke or a clear blocker is reported
    And law and technical-standard nodes keep only thin citation metadata
    And unresolved citations cannot be expressed as official legal basis

  Scenario: RetrieveKnowledge metadata is normalized into stable citation fields
    Given RetrieveKnowledge returns citation metadata for a law or technical-standard record
    When citation resolution runs
    Then each citation record includes provider, rag_doc_ref, node_id, node_type, citation_title, citation_locator, source_hash, resolved_at, retrieval_probe, and report_usage_policy
    And raw_cached is false
    And cache_policy is metadata_only

  Scenario: Citation locator uses the most specific safe metadata
    Given RetrieveKnowledge metadata includes article number, technical-standard number, page, or section
    When citation resolution runs
    Then citation_locator uses the article, standard, page, or section locator instead of source-level

  Scenario: Missing locator metadata degrades honestly
    Given RetrieveKnowledge returns a record title but no article, standard, page, or section metadata
    When citation resolution runs
    Then citation_locator is source-level
    And the report lists the source-level item and reason

  Scenario: Raw RAG text is not cached
    Given RetrieveKnowledge returns a record with Content
    When citation resolution stores citation metadata
    Then Content is not cached
    And excerpt is empty unless a separately approved safe-short-excerpt policy is enabled
