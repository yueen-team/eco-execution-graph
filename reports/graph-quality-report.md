# Graph Quality Report

- status: `pass`
- edge_count: 95
- missing_quality_fields: 0
- high_staleness_edges: 0
- min_confidence: 0.74
- avg_confidence: 0.82
- low_confidence_edges_lt_0_75: 5
- medium_staleness_edges: 46

## Required Fields

- confidence
- confidence_reason
- evidence_count
- last_verified_at
- reviewer_role
- staleness_risk
- confidence_evidence
- source_ref
- review_status

## Conclusion

All P1 graph edges carry the required quality-scoring fields. Medium staleness is expected for lower-confidence aggregate/pitfall demo edges and no high staleness was found.
