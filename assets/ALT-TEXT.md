# Dataset Replay

Logo: Three ledger rows and an open replay loop.

Cover: Dataset Replay. Compare two CSV exports and trace rule failures to source lines. A sample compares physical line 3 for key B-209: 49.00 in the baseline and a blank price in the candidate.

Demo: Dataset Replay sample: the broken candidate has a blank price at line 3, a repeated B-209 key at line 4 and a zero price below 0.01 at line 5. It fails. Reordering the clean export passes.
