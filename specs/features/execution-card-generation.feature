Feature: Full execution card generation
  Scenario: Cards are generated from graph traces
    Given a full product graph built from upstream imports
    When full execution cards are generated
    Then every card traces back to graph nodes, edges, sources, and origin repository metadata
    And shared cards contain no private evidence, rectification, or report-expression details

  Scenario: Hazardous-waste candidates all become traceable slices
    Given the full product graph contains hazardous-waste issue and inspection candidates
    When full execution cards are generated
    Then every hazardous-waste candidate must appear in the hazardous-waste slice catalog
    And the catalog must separate phase one director opening cards from phase two topic slices
    And merge-only slices must stay visible as catalog coverage but must not become standalone director cards

  Scenario: Director demo uses opening cards plus the hazardous-waste catalog
    Given ETO has reviewed the showcase card pack
    When the director demo sequence is generated
    Then phase one must contain exactly five director opening cards
    And phase two must show the hazardous-waste full slice catalog
    And the demo must still exclude private evidence standards, enterprise instances, raw attachments, and law full text

  Scenario: ETO V4 conclusions are ingested without inflating standalone demo cards
    Given ETO V4 marks the hazardous-waste slice conclusions as accepted
    When the conclusions are ingested into execution cards
    Then fourteen hazardous-waste issue cards must be independently available for demo or follow-up explanation
    And three accepted items must be stored as internal scenario or topic templates
    And fourteen accepted merge items must keep their knowledge points but must not become standalone demo cards
