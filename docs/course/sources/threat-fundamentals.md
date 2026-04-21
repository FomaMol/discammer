# Threat fundamentals — source and editorial ledger

Checked 2026-10-20. These links support educational mechanisms and the specifically bounded historical case. They do not establish a live threat feed, global prevalence, a guaranteed recovery method, or a promise of recurring review. Exercises are synthetic except the explicitly labeled Hong Kong case block.

| Primary source | Supports | Scope and date |
|---|---|---|
| [UK NCSC, spotting scam messages and calls](https://www.ncsc.gov.uk/collection/phishing-scams/spot-scams) | Impersonation by email, text, phone or web; authority/urgency cues; independent contact. | UK consumer guidance published 2021, reviewed 2022. UK reporting routes are local; cues do not prove fraud. |
| [FTC, what to do if scammed](https://consumer.ftc.gov/articles/what-do-if-you-were-scammed) | Response depends on payment, account, identity or device exposure; contact payment provider promptly. | US consumer advice, June 2026. Refunds are uncertain; local rights differ. |
| [FTC, data breach response](https://consumer.ftc.gov/consumer-alerts/2022/10/have-you-been-affected-data-breach-read) | Change affected and reused passwords, enable MFA, match actions to data exposed. | US consumer alert, October 2022. Identity and credit remedies are US-specific. |
| [FTC, Consumer Sentinel Data Book 2024](https://www.ftc.gov/reports/consumer-sentinel-network-data-book-2024) | Reports are unverified and are not a population survey. | US reporting database, covering 2024; no individual breach likelihood inference. |
| [NIST SP 800-63B-4, authenticators](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/) | Passwords are not phishing-resistant; salted, costly password hashing resists offline guessing. | Technical standard for identity providers. A company saying “hashed” does not reveal the complete risk. |
| [NIST glossary: malware](https://csrc.nist.gov/glossary/term/malware), [phishing](https://csrc.nist.gov/glossary/term/phishing), [zero-day attack](https://csrc.nist.gov/glossary/term/Zero_Day_Attack) | Mechanism and vocabulary boundaries. | Technical definitions; a term in a popup does not diagnose a device or attribute an actor. Zero-day definition cites CNSSI 4009-2022. |
| [FBI IC3, ransomware](https://www.ic3.gov/CrimeInfo/Ransomware) | Malware that denies access and demands payment; encryption is common, while data theft requires separate evidence. | US law-enforcement overview; US reporting route is not universal. |
| [FBI IC3, BEC](https://www.ic3.gov/CrimeInfo/BEC) | Real business mailboxes can be compromised; verify payment changes via secondary channel and contact bank promptly after loss. | US law-enforcement overview and complaint route; no guarantee of recall. |
| [FBI, infrastructure used in cryptocurrency investment fraud](https://www.ic3.gov/CSA/2025/250529.pdf) | One documented provider supplied hosting and domain infrastructure used by fraudulent investment sites. | Case-specific advisory, 29 May 2025; not a claim about every scam or a live indicator feed. |
| [UK NCSC, fundamentals of cyber risk](https://www.ncsc.gov.uk/collection/risk-management/the-fundamentals-and-basics-of-cyber-risk) | Capability, intent, motivation and opportunity; criminal, state and insider possibilities. | UK organizational risk guidance; actor categories are hypotheses, not message-level attribution. |
| [FBI IC3, investment fraud](https://www.ic3.gov/CrimeInfo/Investment) | Trust-building, fake returns, small early withdrawals and later withdrawal fees. | US law-enforcement overview; patterns are examples, not a test that every unfamiliar investment fails. |
| [FTC, money mule scams](https://consumer.ftc.gov/consumer-alerts/2020/03/whats-money-mule-scam) | Job or relationship pretexts for receiving and relaying funds; deposited checks may later prove fake. | US consumer warning, March 2020. Legal consequences and banking remedies vary by country. |
| [FTC, job scammers](https://consumer.ftc.gov/consumer-alerts/2025/07/job-scammers-are-looking-hire-you) | Fake recruiters seek money or personal information. | US consumer alert, July 2025. Chat interviews alone are not a fraud verdict. |
| [Hong Kong Government, LCQ9 on deepfake fraud](https://www.info.gov.hk/gia/general/202406/26/P2024062600192p.htm) | January 2024 phishing email, prerecorded fabricated conference, no interaction during playback, later instant messages, approximately HK$200m to five accounts. | Official reply, 26 June 2024; investigation then ongoing. It does not establish the precise internal approval process, a fully live interactive meeting, transfer count, or final recovery. |
| [WEF interview with Arup CIO Rob Greig](https://www.weforum.org/stories/emerging-technologies/deepfake-ai-cybercrime-arup/) | Arup identifies itself and CIO states company systems/data were not compromised. | Direct interview, 4 February 2025. Company account, not a full technical reconstruction. |

## Lesson mapping and edits

| Lesson | Core source set | Editorial correction |
|---|---|---|
| `scam-economy` | FTC money mules/jobs; FBI investment fraud/BEC/infrastructure; NCSC | Removed invented message-cost and personalization figures. Roles are a model, not a claim every scam is a marketplace. |
| `attack-vectors` | NCSC; FTC post-scam actions | Removed unsourced SMS open-rate and channel-cost/conversion claims. Independent route means independently sourced contact. |
| `threat-actors` | NCSC phishing/risk guidance; FBI BEC; FTC money mules | Removed categorical targeting and attribution claims. Start with asset and authority, not guessed attacker type. |
| `glossary` | NIST glossary/authenticators; FBI ransomware/investment/BEC; FTC actions | Removed unsupported cost and prevalence claims, distinguished RAT from consent-based remote support and zero-day from attacker identity. |
| `breach-reports` | FTC breach/Sentinel/actions; NIST authenticators | Replaced “hashed means safe/cleartext” absolutes with scheme, salt, cost and uncertainty; report counts are not incidence. |
| `cfo-deepfake-heist` | Hong Kong government; direct Arup CIO interview; FBI BEC; NCSC | Corrected the conference from allegedly real-time interactive to prerecorded, bounded the amount and investigation status, and removed guaranteed callback outcome. |

All source pages above were opened and read for the relevant claim on 2026-10-20. `checked_at` and localized `scope` fields appear in both JSON files for each lesson. The six stories and practices contain no real credentials, payment details or remote requests; the only displayed synthetic URLs use the reserved `.example` suffix.
