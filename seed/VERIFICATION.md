# Beacon seed verification

Date: 2026-10-27. All checks run live with curl/requests from the build machine. 'verifiedCount' = postings returned by the endpoint on this date (SmartRecruiters = totalFound, Workday = total, capped by Workday at 2000). 'internCount' = postings whose title matches intern|trainee|apprentice|graduate|campus|... (SR and Workday use the server-side search 'intern').

## Counts per pack

| Pack | Sources | ATS (verified JSON) | Public API | RSS | Firecrawl |
|---|---|---|---|---|---|
| india-product | 48 | 28 | 0 | 0 | 20 |
| faang-india | 106 | 94 | 0 | 1 | 11 |
| yc-startups | 66 | 62 | 0 | 0 | 4 |
| hackathons | 25 | 0 | 5 | 1 | 19 |
| scholarships | 31 | 0 | 0 | 9 | 22 |
| remote-friendly | 45 | 38 | 0 | 3 | 4 |
| opensource-programs | 17 | 0 | 0 | 7 | 10 |
| **Total** | **338** | **222** | | | |

ATS kinds: greenhouse=85, lever=15, ashby=77, smartrecruiters=12, workable=1, workday=32

Companies tried (ATS probes, unique names): 407; verified ATS sources kept: 222.

## Detection method

- Greenhouse/Lever/Ashby/SmartRecruiters/Workable: for each company, slug candidates (known slug, lowercase-concatenated name, hyphenated name) were probed against all five public endpoints; accepted only on HTTP 200 + >=1 posting. Ambiguous slugs were spot-checked by reading company_name/jobUrl/first title; wrong-company matches were dropped (list below).
- Workday: tenant/wd-host/site discovered from careers-page HTML (myworkdayjobs links) or known patterns, then verified with POST /wday/cxs/<tenant>/<site>/jobs.
- Careers pages that use Darwinbox, Keka, iCIMS, SuccessFactors or custom stacks (Zoho, PhonePe, Flipkart, ...) have no free public JSON; kept as kind=firecrawl (page status verified).

## Dropped after probing (wrong company / stub board)

- Slice (greenhouse slug 'slice' = different company)
- Porter (greenhouse 'porter' = Porter Works)
- Whatfix (SR board only had a 'test' posting)
- Uber (SR 'uber' = 'Test UAT' only; real careers is custom)
- Ramp (gr 'ramp' = unrelated RAMP, real Ramp uses a different board)
- Remote.com (gr 'remote' = General Assembly Remote Jobs)
- Wise (gr 'wise' = Wise Worksite)
- Fly.io (lever 'fly' = unrelated company)
- Neon (lever 'neon' = Brazilian bank)
- Ghost (gr 'ghost' unrelated)
- Anyscale (lever board is a 'we moved' stub)
- Zomato (lever 'eternal' = unrelated performance-team stub)
- Gong (SR 'gong' = GONG! unrelated)
- Axiom (gr 'axiom' = unrelated)

## Tried, no usable ATS endpoint (171)

AMD, Adept, Airtel, Aiven, Amagi, American Express, Amplitude Labs, Anduril, Arc (The Browser Company), Ather Energy, Atlassian, Automattic, BharatPe, BigBasket, Bitcoin India (CoinDCX), Bitso, Blinkit, Buffer, Cal.com, Capillary, CarDekho, Cashfree, Census, Chainalysis, Chargebee, Checkout.com, Cleartrip, CleverTap, Coding Ninjas, Cohesity, CoinSwitch, Confluent, Convex, Country Delight, Cult.fit, Dagster, Darwinbox, Deel, Delhivery, Dell, Documenso, Doist, Dream11, DuckDuckGo, Dunzo, Eightfold, Elementl, Flipkart, Games24x7, Gem, GitHub, Gitpod, Goldman Sachs, Grammarly, Groq, Gumroad, Gupshup, HashiCorp, Hasura, Hasura Cloud, Hippocratic AI, Honeywell, Hotjar, HubSpot, IBM, Icertis, Innovaccer, Instabase, Intuit, Ironclad, JPMorgan, Jasper, Jio, Juniper Networks, Jupiter, Juspay, Khatabook, Klarna, Kraken, KreditBee, Krutrim, Lam Research, Leap Scholar, Lenskart, Lever, Licious, Liveblocks, Loom, MPL, MakeMyTrip, Mamaearth (Honasa), Masai School, Medallia, Meta, MoEngage, Myntra, Nazara, NetApp, Netflix, Nutanix, Nykaa, OkCredit, Ola, Ola Electric, Ona, Ona (Gitpod), Open Financial, Perfios, PharmEasy, PhonePe, PhysicsWallah, Pine Labs, Postman, Practo, Prisma, Qualcomm, Rapido, Raycast, Razorpay Curlec, Razorpay X, RedBus, Replicate, Retool, Revolut, Rippling, Rippling India, Rocketlane, Sahaj, SambaNova, Segment, Segment (Twilio), Setu, ShareChat, Shopify, Snap, Sourcegraph Amp, Spinny, Stytch, Superblocks, Superhuman, Synopsys, Tata Digital, Texas Instruments, Thomson Reuters, Timescale, Turso, Unity, Upstash, Urban Company, VMware, Vedantu, Vercel Labs, Walmart Global Tech, WazirX, Webflow Labs, Weights & Biases, Western Digital, Windsurf, Yellow.ai, Zebra, Zendesk, Zeno Health, Zepto, Zepto Cafe, Zepto Labs, Zerodha, Zluri, Zoho, Zupee, dbt Labs, upGrad

## Verified sources by pack


### india-product (48)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Razorpay | greenhouse | razorpaysoftwareprivatelimited | 200 | 27 | 0 |
| CRED | lever | cred | 200 | 10 | 0 |
| Swiggy | smartrecruiters | swiggy | 200 | 201 | 56 |
| Meesho | lever | meesho | 200 | 54 | 0 |
| Groww | greenhouse | groww | 200 | 10 | 1 |
| Freshworks | smartrecruiters | freshworks | 200 | 126 | 37 |
| Atlan | ashby | atlan | 200 | 7 | 0 |
| Paytm | lever | paytm | 200 | 197 | 7 |
| Navi | ashby | navi | 200 | 2 | 0 |
| Upstox | smartrecruiters | upstox | 200 | 1 | 0 |
| InMobi | greenhouse | inmobi | 200 | 78 | 1 |
| Unacademy | smartrecruiters | unacademy | 200 | 3 | 0 |
| Druva | greenhouse | druva | 200 | 31 | 0 |
| Observe.AI | greenhouse | observeai | 200 | 8 | 0 |
| Mindtickle | lever | mindtickle | 200 | 21 | 0 |
| Zeta | lever | zeta | 200 | 30 | 0 |
| Truecaller | greenhouse | truecaller | 200 | 33 | 0 |
| Tekion | ashby | tekion | 200 | 93 | 0 |
| Sarvam AI | ashby | sarvam | 200 | 45 | 2 |
| Hevo Data | lever | hevodata | 200 | 53 | 1 |
| Zenoti | greenhouse | zenoti | 200 | 55 | 0 |
| Lendingkart | smartrecruiters | lendingkart | 200 | 1 | 0 |
| Ixigo | smartrecruiters | ixigo | 200 | 7 | 2 |
| Scaler | smartrecruiters | interviewbit | 200 | 1 | 0 |
| Newton School | smartrecruiters | newtonschool | 200 | 1 | 0 |
| BrowserStack | workday | browserstack.wd3/External | 200 | 31 | 15 |
| Sprinklr | workday | sprinklr.wd1/careers | 200 | 76 | 25 |
| Uniphore | workday | uniphore.wd503/Uniphore | 200 | 39 | 16 |
| Internshala | firecrawl | https://internshala.com/internships/ | 200 | - | - |
| Flipkart Careers | firecrawl | https://www.flipkartcareers.com/ | 200 | - | - |
| PhonePe Careers | firecrawl | https://www.phonepe.com/careers/ | 200 | - | - |
| Zomato (Eternal) Careers | firecrawl | https://www.zomato.com/careers | 200 | - | - |
| Postman Careers | firecrawl | https://www.postman.com/company/careers/ | 200 | - | - |
| Zoho Careers | firecrawl | https://www.zoho.com/careers/ | 200 | - | - |
| Chargebee Careers | firecrawl | https://www.chargebee.com/company/careers/ | 200 | - | - |
| Hasura Careers | firecrawl | https://hasura.io/careers/ | 200 | - | - |
| Juspay Careers | firecrawl | https://juspay.in/careers | 200 | - | - |
| Lenskart Careers | firecrawl | https://www.lenskart.com/careers | 200 | - | - |
| Zerodha Careers | firecrawl | https://zerodha.com/careers/ | 429 (bot-protected) | - | - |
| Rippling Careers | firecrawl | https://www.rippling.com/careers | 200 | - | - |
| ShareChat Careers | firecrawl | https://sharechat.com/careers | 200 | - | - |
| Cashfree Careers | firecrawl | https://www.cashfree.com/careers/ | 200 | - | - |
| Delhivery Careers | firecrawl | https://www.delhivery.com/careers | 200 | - | - |
| Myntra Careers | firecrawl | https://careers.myntra.com/ | 200 | - | - |
| Nykaa Careers | firecrawl | https://www.nykaa.com/careers | 403 (bot-protected) | - | - |
| Ola Careers | firecrawl | https://www.olacabs.com/careers | 200 | - | - |
| Urban Company Careers | firecrawl | https://careers.urbancompany.com/ | 200 | - | - |
| Dream11 (Dream Sports) Careers | firecrawl | https://dreamsports.group/careers/ | 200 | - | - |

### faang-india (106)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Airbnb | greenhouse | airbnb | 200 | 189 | 2 |
| Stripe | greenhouse | stripe | 200 | 714 | 30 |
| Coinbase | greenhouse | coinbase | 200 | 224 | 27 |
| Databricks | greenhouse | databricks | 200 | 896 | 18 |
| Figma | greenhouse | figma | 200 | 141 | 10 |
| Notion | ashby | notion | 200 | 140 | 8 |
| Canva | smartrecruiters | canva | 200 | 78 | 42 |
| Dropbox | greenhouse | dropbox | 200 | 20 | 0 |
| Cloudflare | greenhouse | cloudflare | 200 | 461 | 3 |
| Twilio | greenhouse | twilio | 200 | 136 | 0 |
| Plaid | ashby | plaid | 200 | 130 | 0 |
| Brex | greenhouse | brex | 200 | 266 | 0 |
| Vercel | greenhouse | vercel | 200 | 93 | 2 |
| Anthropic | greenhouse | anthropic | 200 | 679 | 0 |
| OpenAI | ashby | openai | 200 | 796 | 0 |
| Scale AI | greenhouse | scaleai | 200 | 166 | 8 |
| Cohere | ashby | cohere | 200 | 116 | 4 |
| Airtable | greenhouse | airtable | 200 | 4 | 0 |
| Duolingo | greenhouse | duolingo | 200 | 60 | 5 |
| Discord | greenhouse | discord | 200 | 46 | 0 |
| Reddit | greenhouse | reddit | 200 | 159 | 0 |
| Pinterest | greenhouse | pinterest | 200 | 158 | 17 |
| Roblox | greenhouse | roblox | 200 | 267 | 9 |
| ServiceNow | smartrecruiters | servicenow | 200 | 688 | 162 |
| Zscaler | greenhouse | zscaler | 200 | 355 | 0 |
| Rubrik | greenhouse | rubrik | 200 | 147 | 4 |
| MongoDB | greenhouse | mongodb | 200 | 365 | 3 |
| Datadog | greenhouse | datadog | 200 | 429 | 7 |
| Snowflake | ashby | snowflake | 200 | 357 | 7 |
| Okta | greenhouse | okta | 200 | 392 | 0 |
| Instacart | greenhouse | instacart | 200 | 100 | 0 |
| Lyft | greenhouse | lyft | 200 | 179 | 19 |
| Robinhood | greenhouse | robinhood | 200 | 155 | 3 |
| Chime | greenhouse | chime | 200 | 75 | 0 |
| Affirm | greenhouse | affirm | 200 | 225 | 7 |
| Monzo | greenhouse | monzo | 200 | 69 | 2 |
| N26 | greenhouse | n26 | 200 | 38 | 0 |
| Spotify | lever | spotify | 200 | 89 | 0 |
| Fastly | greenhouse | fastly | 200 | 52 | 0 |
| Mixpanel | greenhouse | mixpanel | 200 | 46 | 0 |
| Amplitude | ashby | amplitude | 200 | 39 | 0 |
| Nextdoor | greenhouse | nextdoor | 200 | 23 | 0 |
| Epic Games | greenhouse | epicgames | 200 | 148 | 22 |
| Riot Games | greenhouse | riotgames | 200 | 184 | 1 |
| Block | greenhouse | block | 200 | 207 | 2 |
| Toast | greenhouse | toast | 200 | 329 | 0 |
| Squarespace | greenhouse | squarespace | 200 | 27 | 0 |
| Arista Networks | smartrecruiters | aristanetworks | 200 | 242 | 94 |
| Thoughtworks | greenhouse | thoughtworks | 200 | 44 | 4 |
| Mistral AI | ashby | mistral.ai | 200 | 223 | 3 |
| DoorDash | greenhouse | doordashusa | 200 | 447 | 10 |
| Palantir | lever | palantir | 200 | 307 | 84 |
| SpaceX | greenhouse | spacex | 200 | 2834 | 55 |
| Waymo | greenhouse | waymo | 200 | 367 | 64 |
| Coursera | greenhouse | coursera | 200 | 28 | 0 |
| Quora | ashby | quora | 200 | 9 | 3 |
| Pure Storage | greenhouse | purestorage | 200 | 368 | 1 |
| SingleStore | greenhouse | singlestore | 200 | 40 | 4 |
| Sumo Logic | greenhouse | sumologic | 200 | 12 | 0 |
| New Relic | greenhouse | newrelic | 200 | 50 | 0 |
| PagerDuty | greenhouse | pagerduty | 200 | 50 | 0 |
| Asana | greenhouse | asana | 200 | 114 | 0 |
| Veeva | lever | veeva | 200 | 909 | 8 |
| Gemini | greenhouse | gemini | 200 | 30 | 6 |
| Ledger | ashby | ledger | 200 | 13 | 0 |
| Mastercard | workday | mastercard.wd1/CorporateCareers | 200 | 1154 | 726 |
| Nvidia | workday | nvidia.wd5/NVIDIAExternalCareerSite | 200 | 2000 | 1099 |
| Samsung Electronics (incl. R&D India) | workday | sec.wd3/Samsung_Careers | 200 | 659 | 251 |
| Workday | workday | workday.wd5/Workday | 200 | 375 | 186 |
| Palo Alto Networks | workday | paloaltonetworks.wd5/panwexternalcareers | 200 | 1406 | 748 |
| Micron | workday | micron.wd1/External | 200 | 3126 | 3126 |
| HPE (incl. Juniper Networks) | workday | hpe.wd5/Jobsathpe | 200 | 1688 | 1063 |
| Adobe | workday | adobe.wd5/external_experienced | 200 | 290 | 128 |
| Salesforce | workday | salesforce.wd12/External_Career_Site | 200 | 1588 | 821 |
| Autodesk | workday | autodesk.wd1/Ext | 200 | 183 | 136 |
| Broadcom (incl. VMware) | workday | broadcom.wd1/External_Career | 200 | 371 | 91 |
| Cisco | workday | cisco.wd5/Cisco_Careers | 200 | 1510 | 652 |
| Capital One | workday | capitalone.wd12/Capital_One | 200 | 1993 | 1195 |
| PayPal | workday | paypal.wd1/jobs | 200 | 326 | 184 |
| Intel | workday | intel.wd1/External | 200 | 792 | 494 |
| Cadence | workday | cadence.wd1/External_Careers | 200 | 675 | 188 |
| Marvell | workday | marvell.wd1/MarvellCareers | 200 | 343 | 274 |
| Analog Devices | workday | analogdevices.wd1/External | 200 | 831 | 489 |
| Applied Materials | workday | amat.wd1/External | 200 | 2000 | 1464 |
| BlackRock | workday | blackrock.wd1/BlackRock_Professional | 200 | 290 | 156 |
| Wells Fargo | workday | wf.wd1/WellsFargoJobs | 200 | 1458 | 620 |
| Citi | workday | citi.wd5/2 | 200 | 2000 | 2000 |
| Ciena | workday | ciena.wd5/Careers | 200 | 145 | 75 |
| KLA | workday | kla.wd1/Search | 200 | 1116 | 819 |
| Morgan Stanley | workday | ms.wd5/External | 200 | 1259 | 628 |
| Zoom | workday | zoom.wd5/Zoom | 200 | 91 | 36 |
| Red Hat | workday | redhat.wd5/Jobs | 200 | 154 | 109 |
| Rockwell | workday | rockwellautomation.wd1/External_Rockwell_Automation | 200 | 455 | 204 |
| Visa | workday | visa.wd5/Visa | 200 | 852 | 491 |
| Google Careers India | firecrawl | https://www.google.com/about/careers/applications/jobs/results/?locati | 200 | - | - |
| Microsoft Careers India | firecrawl | https://careers.microsoft.com/v2/global/en/home.html | 200 | - | - |
| Apple Jobs India | firecrawl | https://jobs.apple.com/en-in/search | 200 | - | - |
| Netflix Jobs | firecrawl | https://explore.jobs.netflix.net/careers | 200 | - | - |
| Oracle Careers India | firecrawl | https://careers.oracle.com/jobs/ | 200 | - | - |
| Cisco Careers India | firecrawl | https://jobs.cisco.com/ | 200 | - | - |
| Atlassian Careers | firecrawl | https://www.atlassian.com/company/careers/all-jobs | 200 | - | - |
| GitHub Careers | firecrawl | https://www.github.careers/careers-home | 200 | - | - |
| Visa Careers | firecrawl | https://corporate.visa.com/en/jobs/ | 200 | - | - |
| Qualcomm Careers | firecrawl | https://careers.qualcomm.com/careers | 200 | - | - |
| Intuit Careers | rss | https://jobs.intuit.com/rss | 200 | 596 | - |
| Shopify Careers | firecrawl | https://www.shopify.com/careers | 200 | - | - |

### yc-startups (66)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Replit | ashby | replit | 200 | 36 | 1 |
| PostHog | ashby | posthog | 200 | 11 | 0 |
| Airbyte | ashby | airbyte | 200 | 13 | 0 |
| Render | ashby | render | 200 | 36 | 0 |
| Railway | ashby | railway | 200 | 7 | 0 |
| PlanetScale | greenhouse | planetscale | 200 | 12 | 0 |
| Clerk | ashby | clerk | 200 | 1 | 0 |
| Resend | ashby | resend | 200 | 14 | 0 |
| Firecrawl | ashby | firecrawl | 200 | 33 | 0 |
| Gusto | greenhouse | gusto | 200 | 97 | 1 |
| Mercury | greenhouse | mercury | 200 | 76 | 0 |
| Deepgram | ashby | deepgram | 200 | 82 | 0 |
| Modal | ashby | modal | 200 | 43 | 1 |
| Pinecone | ashby | pinecone | 200 | 8 | 0 |
| Weaviate | ashby | weaviate | 200 | 2 | 0 |
| Runway | ashby | runway | 200 | 3 | 0 |
| Perplexity | ashby | perplexity | 200 | 132 | 6 |
| Together AI | greenhouse | togetherai | 200 | 85 | 14 |
| LangChain | ashby | langchain | 200 | 104 | 2 |
| LlamaIndex | ashby | llamaindex | 200 | 4 | 0 |
| ElevenLabs | ashby | elevenlabs | 200 | 149 | 0 |
| Cursor (Anysphere) | ashby | cursor | 200 | 123 | 1 |
| Glean | smartrecruiters | glean | 200 | 1 | 0 |
| Harvey | ashby | harvey | 200 | 364 | 2 |
| Sierra | ashby | sierra | 200 | 210 | 8 |
| Decagon | ashby | decagon | 200 | 133 | 2 |
| Cognition | ashby | cognition | 200 | 105 | 0 |
| Character.AI | ashby | character | 200 | 13 | 0 |
| Hex | ashby | hex | 200 | 38 | 2 |
| Rillet | ashby | rillet | 200 | 40 | 0 |
| Ashby | ashby | ashby | 200 | 66 | 0 |
| Zip | ashby | zip | 200 | 109 | 0 |
| Vanta | ashby | vanta | 200 | 84 | 0 |
| Drata | ashby | drata | 200 | 33 | 0 |
| Lattice | greenhouse | lattice | 200 | 9 | 0 |
| Scribe | ashby | scribe | 200 | 30 | 0 |
| Alchemy | ashby | alchemy | 200 | 20 | 0 |
| Mintlify | ashby | mintlify | 200 | 16 | 0 |
| Prefect | ashby | prefect | 200 | 8 | 0 |
| Hightouch | ashby | hightouch | 200 | 1 | 0 |
| Metabase | lever | metabase | 200 | 19 | 0 |
| Infisical | ashby | infisical | 200 | 12 | 0 |
| Trigger.dev | ashby | triggerdev | 200 | 6 | 0 |
| Inngest | ashby | inngest | 200 | 1 | 0 |
| WorkOS | ashby | workos | 200 | 28 | 0 |
| Tinybird | lever | tinybird | 200 | 2 | 0 |
| Mux | ashby | mux | 200 | 1 | 0 |
| Warp | greenhouse | warp | 200 | 4 | 0 |
| Zed Industries | ashby | zed | 200 | 1 | 0 |
| Lovable | greenhouse | lovable | 200 | 61 | 0 |
| Bolt (StackBlitz) | greenhouse | stackblitz | 200 | 6 | 0 |
| Cartesia | ashby | cartesia | 200 | 23 | 0 |
| Fireworks AI | ashby | fireworks | 200 | 91 | 2 |
| Baseten | ashby | baseten | 200 | 109 | 0 |
| Cerebras | ashby | cerebras | 200 | 119 | 4 |
| Lambda | ashby | lambda | 200 | 99 | 1 |
| CoreWeave | greenhouse | coreweave | 200 | 315 | 0 |
| Crusoe | ashby | crusoe | 200 | 349 | 0 |
| Writer | ashby | writer | 200 | 46 | 0 |
| Synthesia | ashby | synthesia | 200 | 36 | 0 |
| Abridge | ashby | abridge | 200 | 40 | 1 |
| Ambience Healthcare | ashby | ambiencehealthcare | 200 | 19 | 0 |
| Wellfound Startup Jobs | firecrawl | https://wellfound.com/jobs | 200 | - | - |
| Work at a Startup (YC) | firecrawl | https://www.workatastartup.com/jobs | 406 (bot-protected) | - | - |
| YC Companies Directory | firecrawl | https://www.ycombinator.com/companies?hasInterns=true | 200 | - | - |
| YC Jobs Board | firecrawl | https://www.ycombinator.com/jobs | 200 | - | - |

### hackathons (25)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Devpost Hackathons | publicapi | https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&pag | 200 | 173 | - |
| MLH Hackathon Season 2027 | firecrawl | https://www.mlh.com/seasons/2027/events | 200 | - | - |
| MLH Hackathon Season 2026 (archive) | firecrawl | https://www.mlh.com/seasons/2026/events | 200 | - | - |
| Devfolio Hackathons | publicapi | https://api.devfolio.co/api/search/hackathons | 200 | 12 | - |
| Kaggle Competitions | publicapi | https://www.kaggle.com/api/i/competitions.CompetitionService/ListCompe | 200 | 23 | - |
| Unstop Hackathons | publicapi | https://unstop.com/api/public/opportunity/search-result?opportunity=ha | 200 | 209 | - |
| HackerEarth Challenges | publicapi | https://www.hackerearth.com/chrome-extension/events/ | 200 | 2 | - |
| Hack2skill | firecrawl | https://hack2skill.com/ | 200 | - | - |
| DoraHacks | firecrawl | https://dorahacks.io/hackathon | 200 | - | - |
| ETHGlobal Events | firecrawl | https://ethglobal.com/events | 200 | - | - |
| Smart India Hackathon | firecrawl | https://www.sih.gov.in/ | 403 (bot-protected) | - | - |
| Lablab.ai Events | firecrawl | https://lablab.ai/event | 200 | - | - |
| Taikai Hackathons | firecrawl | https://taikai.network/hackathons | 200 | - | - |
| Hack Club | rss | https://hackclub.com/api/v1/events/rss | 200 | 20 | - |
| Major League Hacking | firecrawl | https://www.mlh.com/ | 200 | - | - |
| Hackathon.com | firecrawl | https://www.hackathon.com/ | 200 | - | - |
| Techgig Hackathons | firecrawl | https://www.techgig.com/hackathon | 200 | - | - |
| HackerRank Contests | firecrawl | https://www.hackerrank.com/contests | 200 | - | - |
| CodeChef Contests | firecrawl | https://www.codechef.com/contests | 200 | - | - |
| Codeforces Contests | firecrawl | https://codeforces.com/contests | 200 | - | - |
| Google Developer Student Clubs | firecrawl | https://developers.google.com/community/gdsc | 200 | - | - |
| Microsoft Imagine Cup | firecrawl | https://imaginecup.microsoft.com/ | 200 | - | - |
| Google Solution Challenge | firecrawl | https://developers.google.com/community/gdsc-solution-challenge | 200 | - | - |
| Flipkart GRiD | firecrawl | https://unstop.com/competitions/flipkart-grid | 200 | - | - |
| ETHIndia | firecrawl | https://ethindia.co/ | 200 | - | - |

### scholarships (31)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Buddy4Study | firecrawl | https://www.buddy4study.com/ | 200 | - | - |
| National Scholarship Portal | firecrawl | https://scholarships.gov.in/ | 200 | - | - |
| Vidyasaarathi | firecrawl | https://www.vidyasaarathi.co.in/ | 200 | - | - |
| Reliance Foundation Scholarships | firecrawl | https://www.reliancefoundation.org/ | 200 | - | - |
| Tata Trusts Education | firecrawl | https://www.tatatrusts.org/our-work/individual-grants-programme/educat | 200 | - | - |
| KVPY / DST Fellowships | firecrawl | https://dst.gov.in/scientific-programmes | 200 | - | - |
| Generation Google Scholarship | firecrawl | https://buildyourfuture.withgoogle.com/scholarships | 200 | - | - |
| Google Women Techmakers | firecrawl | https://www.womentechmakers.com/scholars | 200 | - | - |
| Adobe Research Women-in-Technology | firecrawl | https://research.adobe.com/ | 200 | - | - |
| Amazon Future Engineer | rss | https://www.amazonfutureengineer.com/index.rss | 200 | 0 | - |
| Inlaks Scholarships | firecrawl | https://www.inlaksfoundation.org/scholarships/ | 200 | - | - |
| JN Tata Endowment | rss | https://jntataendowment.org/feed/ | 200 | 10 | - |
| Fulbright-Nehru | rss | https://www.usief.org.in/feed/ | 200 | 3 | - |
| DAAD India Scholarships | firecrawl | https://www.daad.in/en/find-funding/ | 200 | - | - |
| Mitacs Globalink Research Internship | rss | https://www.mitacs.ca/feed/ | 200 | 12 | - |
| Erasmus Mundus | rss | https://erasmus-plus.ec.europa.eu/rss.xml | 200 | 10 | - |
| Commonwealth Scholarships | rss | https://cscuk.fcdo.gov.uk/feed/ | 200 | 10 | - |
| Rhodes Scholarship | firecrawl | https://www.rhodeshouse.ox.ac.uk/scholarships/the-rhodes-scholarship/ | 200 | - | - |
| Schwarzman Scholars | rss | https://www.schwarzmanscholars.org/feed | 200 | 10 | - |
| Knight-Hennessy Scholars | firecrawl | https://knight-hennessy.stanford.edu/ | 200 | - | - |
| Palantir Fellowships | firecrawl | https://www.palantir.com/careers/students/ | 200 | - | - |
| Thiel Fellowship | firecrawl | https://thielfellowship.org/ | 200 | - | - |
| Emergent Ventures India | firecrawl | https://www.mercatus.org/emergent-ventures | 403 (bot-protected) | - | - |
| Antler India | firecrawl | https://www.antler.co/ | 200 | - | - |
| Google PhD Fellowship | firecrawl | https://research.google/programs-and-events/phd-fellowship/ | 200 | - | - |
| Microsoft Research India (fellowships & internships) | rss | https://www.microsoft.com/en-us/research/feed/ | 200 | 10 | - |
| IISc Summer Research Fellowship | firecrawl | https://iisc.ac.in/ | 200 | - | - |
| Indian Academy of Sciences SRFP | firecrawl | https://www.ias.ac.in/Initiatives/Summer_Research_Fellowship_Programme | 200 | - | - |
| Aditya Birla Scholarship | rss | https://www.adityabirlascholars.net/feed/ | 200 | 10 | - |
| HDFC Parivartan ECSS | firecrawl | https://www.buddy4study.com/page/hdfc-bank-parivartans-ecss-programme | 200 | - | - |
| Sitaram Jindal Foundation | firecrawl | https://www.sitaramjindalfoundation.org/scholarships.php | 200 | - | - |

### remote-friendly (45)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Supabase | ashby | supabase | 200 | 64 | 0 |
| Linear | ashby | linear | 200 | 32 | 0 |
| Hugging Face | workable | huggingface | 200 | 6 | 0 |
| Webflow | ashby | webflow | 200 | 17 | 0 |
| Elastic | greenhouse | elastic | 200 | 403 | 0 |
| GitLab | greenhouse | gitlab | 200 | 239 | 0 |
| Grafana Labs | greenhouse | grafanalabs | 200 | 134 | 0 |
| Canonical | greenhouse | canonical | 200 | 314 | 11 |
| Zapier | ashby | zapier | 200 | 12 | 0 |
| Toptal | lever | toptal | 200 | 30 | 0 |
| Mozilla | greenhouse | mozilla | 200 | 125 | 0 |
| Wikimedia Foundation | greenhouse | wikimedia | 200 | 15 | 1 |
| Sentry | ashby | sentry | 200 | 42 | 2 |
| Fivetran | greenhouse | fivetran | 200 | 172 | 0 |
| Temporal | ashby | temporal | 200 | 72 | 0 |
| Algolia | greenhouse | algolia | 200 | 26 | 0 |
| Contentful | greenhouse | contentful | 200 | 23 | 0 |
| Sanity | ashby | sanity | 200 | 32 | 0 |
| Netlify | greenhouse | netlify | 200 | 4 | 0 |
| Cockroach Labs | greenhouse | cockroachlabs | 200 | 15 | 0 |
| Redis | ashby | redis | 200 | 28 | 0 |
| ClickHouse | ashby | clickhouse | 200 | 203 | 1 |
| Tailscale | greenhouse | tailscale | 200 | 53 | 0 |
| 1Password | ashby | 1password | 200 | 87 | 11 |
| Bitwarden | greenhouse | bitwarden | 200 | 35 | 0 |
| Proton | greenhouse | proton | 200 | 20 | 0 |
| Mattermost | greenhouse | mattermost | 200 | 10 | 0 |
| JetBrains | greenhouse | jetbrains | 200 | 47 | 2 |
| Close | ashby | close | 200 | 6 | 0 |
| Help Scout | ashby | helpscout | 200 | 8 | 0 |
| Articulate | lever | articulate | 200 | 2 | 0 |
| Cloudinary | lever | cloudinary | 200 | 12 | 0 |
| Sourcegraph | greenhouse | sourcegraph91 | 200 | 8 | 0 |
| Contentsquare (incl. Hotjar) | lever | contentsquare | 200 | 18 | 0 |
| TigerData (Timescale) | ashby | tigerdata | 200 | 11 | 0 |
| Khan Academy | greenhouse | khanacademy | 200 | 5 | 0 |
| Consensys | greenhouse | consensys | 200 | 11 | 0 |
| Polygon Labs | ashby | polygon-labs | 200 | 4 | 0 |
| Remote.com Careers | firecrawl | https://remote.com/careers | 200 | - | - |
| Automattic Careers | rss | https://automattic.com/feed/ | 200 | 10 | - |
| Buffer Careers | firecrawl | https://buffer.com/journey | 200 | - | - |
| We Work Remotely | rss | https://weworkremotely.com/remote-jobs.rss | 200 | 96 | - |
| Working Nomads | firecrawl | https://www.workingnomads.com/jobs | 200 | - | - |
| Himalayas | firecrawl | https://himalayas.app/jobs | 403 (bot-protected) | - | - |
| Hacker News 'Who is hiring' (hnrss) | rss | https://hnrss.org/whoishiring/jobs | 200 | 20 | - |

### opensource-programs (17)

| Source | Kind | Token / endpoint | HTTP | Count | Interns |
|---|---|---|---|---|---|
| Google Summer of Code | firecrawl | https://summerofcode.withgoogle.com/ | 200 | - | - |
| MLH Fellowship | firecrawl | https://fellowship.mlh.io/ | 200 | - | - |
| LFX Mentorship | firecrawl | https://mentorship.lfx.linuxfoundation.org/ | 200 | - | - |
| Outreachy | rss | https://www.outreachy.org/blog/feed | 200 | 43 | - |
| Season of Docs | firecrawl | https://developers.google.com/season-of-docs | 200 | - | - |
| Hacktoberfest | firecrawl | https://hacktoberfest.com/ | 200 | - | - |
| Google Summer of Code (Blog) | rss | https://opensource.googleblog.com/feeds/posts/default | 200 | 25 | - |
| Rails Girls Summer of Code | rss | http://railsgirlssummerofcode.org/blog.xml | 200 | 355 | - |
| Social Summer of Code | firecrawl | https://ssoc.devfolio.co/ | 200 | - | - |
| GirlScript Summer of Code | firecrawl | https://gssoc.girlscript.tech/ | 200 | - | - |
| Summer of Bitcoin | firecrawl | https://www.summerofbitcoin.org/ | 200 | - | - |
| Processing Foundation Fellowships | rss | https://processingfoundation.org/rss.xml | 200 | 15 | - |
| Open Source Promotion Plan (OSPP) | firecrawl | https://summer-ospp.ac.cn/ | 200 | - | - |
| Julia Seasons of Contributions | rss | https://julialang.org/feed | 200 | 158 | - |
| KDE Season of KDE | firecrawl | https://season.kde.org/ | 200 | - | - |
| FOSS United | rss | https://fossunited.org/rss.xml | 200 | 20 | - |
| Linux Foundation Training Scholarships | rss | https://training.linuxfoundation.org/feed/ | 200 | 10 | - |

## Endpoint shape differences vs SPEC section 2 / 9

- Greenhouse: matches. job description is entity-escaped HTML in jobs[].content. Boards moved to job-boards.greenhouse.io but boards-api still works. A bad token returns 404 JSON, not an empty list. Some company tokens are non-obvious (razorpaysoftwareprivatelimited, doordashusa, gleanwork, sourcegraph91).
- Lever: matches (bare JSON array). EU-hosted tenants use api.eu.lever.co (none found here). Stale/moved boards stay 200 with one 'we moved' posting, so check content.
- Ashby: matches ({jobs[],apiVersion}); each job has descriptionHtml/descriptionPlain, isRemote, workplaceType, publishedAt. Some tokens contain dots (mistral.ai).
- SmartRecruiters: the list endpoint returns NO description (only name, location, department, typeOfEmployment, experienceLevel, releasedDate); a second call per posting /postings/{id} is needed for jobAd. Paginates with limit<=100&offset. IMPORTANT: any unknown company id also returns 200 with totalFound=0 (and sometimes unrelated companies), so require totalFound>0 and verify company.name.
- Workable: both documented endpoints work. GET https://www.workable.com/api/accounts/<slug>?details=true returns {name,description,jobs[]} with full description; POST https://apply.workable.com/api/v3/accounts/<slug>/jobs (body {"query":"","location":[],"department":[],"worktype":[],"remote":[]}) returns {results[]} without description (needs per-job fetch). Only one working Workable board was found (huggingface); Workable adoption among probed companies is low.
- Workday: POST body {"appliedFacets":{},"limit":20,"offset":0,"searchText":""}; limit is capped at 20 per page, total reported is capped at 2000. List items hold only title, externalPath, locationsText, postedOn (relative text like 'Posted 3 Days Ago'), bulletFields; description needs GET https://<tenant>.<wd>.myworkdayjobs.com/wday/cxs/<tenant>/<site><externalPath>. Tenant/host/site are per-company (e.g. nvidia.wd5/NVIDIAExternalCareerSite, samsung = tenant 'sec' wd3 Samsung_Careers, uniphore wd503). Some guessed tenants returned HTTP 422 (wrong site) or 401.
- Public APIs: Kaggle's JSON only returns for non-browser User-Agents; Devfolio's working API is POST /api/search/hackathons (not GET /api/hackathons); MLH moved from mlh.io to mlh.com (302 from mlh.io); Devpost API returns 9 items/page and dates only as display strings.
- Bot-protected careers/portal pages (403/406/429): see rows flagged above; they need Firecrawl with browser rendering or should be dropped by the worker if Firecrawl also fails.
- Unreachable from the build network (timeouts/TLS): chevening.org, sfp.iitm.ac.in, aicte-india.gov.in, svmcm.wbhed.gov.in, swoc.scriptindia.org, remote.co, scholarshipscorner.com, nsp.gov.in (scholarships.gov.in itself answered 200). Excluded rather than guessed.
