Feature: Semantic Profile Lab contract compatibility
  Scenario: SPL governance contracts are read before full graph export
    Given the local semantic-profile-lab repository is readable
    When contract compatibility is checked
    Then graph export, provenance, consumption governance, and manual adoption contracts are classified
    And conflicts are reported instead of silently overwriting local schema
