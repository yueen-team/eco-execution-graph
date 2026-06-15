Feature: 上游公共语义骨架可见化
  Scenario: eco-kb approved baseline must be visible in the graph demo
    Given eco-semantic-knowledge-base has been imported as approved baseline
    When the graph UI loads the full product demo data
    Then the UI provides a Chinese "上游骨架" entry
    And it shows upstream node counts, edge counts, imported asset rows, and locked commit
    And it explains that eco-kb is public skeleton while private execution capability remains inside graph
    And it does not expose real enterprise data, secrets, law full text, evidence judgment standards, rectification templates, or report expression templates
