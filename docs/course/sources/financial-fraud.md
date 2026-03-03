# Financial-fraud course sources

Checked against the linked official pages on **2026-10-20**. The US Secret Service PDF was fetched from its official URL and text-inspected locally after browser fetch returned 403. The PCI SSC page is merchant-facing, the Visa page explains tokenization, and Chrome Help documents extension permissions; none authenticates a specific merchant. The 2017 SEC ICO bulletin is historical risk guidance, not a current legal classification. These references support general education, not case-specific legal or financial advice.

| Primary source | URL | Lessons | Scope and limitation |
|---|---|---|---|
| FTC: Online Shopping | https://consumer.ftc.gov/articles/online-shopping | fake-stores, winning-disputes | US consumer shopping, records, payment and dispute guidance; HTTPS is not proof of a seller. |
| FBI IC3: Business Email Compromise | https://www.ic3.gov/CrimeInfo/BEC | invoice-fraud | US complaint/recall route; cross-channel verification principle is broadly useful. |
| FTC: Before Giving to a Charity | https://consumer.ftc.gov/articles/giving-charity | charity-fraud | US charity, fundraising and payment guidance; registration rules vary elsewhere. |
| FTC: What To Do if You Were Scammed | https://consumer.ftc.gov/articles/what-do-if-you-were-scammed | fake-stores, pig-butchering-pipeline, charity-fraud, first-24-hours, winning-disputes | US payment-provider and account response; no recovery guarantee. |
| FBI IC3: Cryptocurrency | https://www.ic3.gov/CrimeInfo/Cryptocurrency | crypto-investment-scams, pig-butchering-pipeline, first-24-hours | US reporting and transaction evidence; blockchain transfers generally cannot be reversed. |
| FBI IC3: Investment Fraud | https://www.ic3.gov/CrimeInfo/Investment | crypto-investment-scams, pig-butchering-pipeline | US law-enforcement descriptions of confidence-based fake investment platforms. |
| FTC: What To Know About Cryptocurrency and Scams | https://consumer.ftc.gov/articles/what-know-about-cryptocurrency-scams | crypto-investment-scams | US consumer guidance on false guarantees, fake platforms and crypto payments. |
| SEC Investor.gov: Initial Coin Offerings (2017 bulletin) | https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-16 | crypto-investment-scams | Dated 2017 US investor bulletin on ICO research, token rights, code and audit questions; not current legal classification. |
| Bank of Russia: Financial Market Participants | https://www.cbr.ru/finorg/ | crypto-investment-scams | Russian register of rights to perform specified financial activities; listing is no return guarantee. |
| US Secret Service: ATM & POS Terminal Skimming (February 2025) | https://www.secretservice.gov/sites/default/files/reports/2025-02/Public-Alerts-2025-ATM-POS-Terminal-Skimming.pdf | card-skimming | US advisory on physical skimmers, PIN shielding, alerts and reporting; February 2025. |
| Bank of Russia: Unauthorized Card Debits | https://www.cbr.ru/Reception/TopicalMessage/Page/3402 | card-skimming, first-24-hours | Russian cardholder steps for an unauthorized debit; not an automatic refund rule. |
| FTC: Using Credit Cards and Disputing Charges | https://consumer.ftc.gov/articles/using-credit-cards-and-disputing-charges | winning-disputes | US federal credit-card billing-error procedure, including its written 60-day notice rule. |
| PCI SSC: Payment Page Security and Preventing E-Skimming | https://blog.pcisecuritystandards.org/new-information-supplement-payment-page-security-and-preventing-e-skimming | card-skimming | March 2025 merchant/service-provider guidance on browser payment-page scripts; not a consumer detector. |
| Google Chrome Help: Install and Manage Extensions | https://support.google.com/chrome/answer/2664769?hl=en | card-skimming | Chrome-specific controls for extension access to website data; not a skimmer detector. |
| Visa: What is Tokenisation? | https://corporate.visa.com/en/sites/visa-perspectives/innovation/what-is-tokenisation.html | card-skimming | Visa explanation of replacing card number with payment token; implementation varies by wallet/provider. |
| FBI IC3: Complaint FAQ | https://www.ic3.gov/Home/FAQ | invoice-fraud, first-24-hours | US complaint intake and evidence retention; IC3 does not accept attachments. |

## Editorial decisions

- Replaced unsupported fixed loss rates, global prevalence claims and guaranteed recovery language with mechanisms and bounded official guidance.
- US FTC/IC3 rights and reporting are identified as US-specific; the Bank of Russia register and unauthorized-card FAQ are identified as Russian-specific. The latter applies to unauthorized card debits, not every authorized transfer.
- The US FCBA written 60-day billing-error notice is anchored to the first statement and is not generalized to other countries or payment types. Temporary issuer credits remain provisional.
- `.example` domains and all lesson cases and practices are synthetic. No real payment details, passwords or incident evidence are requested by the lessons.
- A small investment withdrawal is described as potential bait. Learners are never advised to fund a larger transfer or pay a withdrawal fee as a test.
