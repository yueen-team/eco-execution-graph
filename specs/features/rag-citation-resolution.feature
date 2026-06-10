Feature: RAG citation resolution
  Scenario: RAG citations never write full text into graph nodes
    Given Tencent LKE credentials are configured through environment variables
    When citation resolution runs
    Then real smoke or a clear blocker is reported
    And law and technical-standard nodes keep only thin citation metadata
    And unresolved citations cannot be expressed as official legal basis
