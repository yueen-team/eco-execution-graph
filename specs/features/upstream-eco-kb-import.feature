Feature: Eco-KB approved baseline import
  Scenario: Approved baseline assets drive full product graph
    Given the local eco-semantic-knowledge-base repository is readable
    When the P2P3 import pipeline runs
    Then upstream lock and import coverage reports are generated
    And the full product graph contains nodes from eco-kb approved baseline
    And P1 seed is recorded as compatibility sample only
