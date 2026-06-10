Feature: Full execution card generation
  Scenario: Cards are generated from graph traces
    Given a full product graph built from upstream imports
    When full execution cards are generated
    Then every card traces back to graph nodes, edges, sources, and origin repository metadata
    And shared cards contain no private evidence, rectification, or report-expression details
