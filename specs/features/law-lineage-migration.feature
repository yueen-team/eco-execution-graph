Feature: Law lineage migration
  Scenario: Government lineage is contract-ready but not blocking
    Given no real government lineage import is available
    When lineage readiness is checked
    Then the supported edge types are documented
    And the final report marks government lineage real import as blocked or partial
