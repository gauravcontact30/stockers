export type CapTier = "Large" | "Mid" | "Small";

export type StockMeta = {
  symbol: string;
  yahooSymbol: string;
  name: string;
  sector: string;
  domain: string;
  capTier: CapTier;
};

export type SectorMeta = {
  key: string;
  name: string;
  description: string;
};

export const sectors: SectorMeta[] = [
  { key: "it", name: "Information Technology", description: "India's global technology and IT-services powerhouse, spanning software services, consulting, and digital engineering." },
  { key: "banking", name: "Banking", description: "Public and private sector banks forming the backbone of India's credit and payments system." },
  { key: "nbfc", name: "NBFC & Financial Services", description: "Non-banking lenders, asset financiers, and diversified financial-services groups." },
  { key: "insurance", name: "Insurance", description: "Life, health, and general insurers serving India's fast-growing protection and savings market." },
  { key: "energy", name: "Energy & Petrochemicals", description: "Oil, gas, and refining majors that power India's energy supply chain." },
  { key: "fmcg", name: "FMCG", description: "Household and personal-care brands selling to nearly every Indian consumer." },
  { key: "auto", name: "Automobile", description: "Passenger vehicle, two-wheeler, and commercial vehicle manufacturers." },
  { key: "pharma", name: "Pharmaceuticals", description: "Generic drugmakers and specialty pharma companies serving India and global markets." },
  { key: "metals", name: "Metals & Mining", description: "Steel, aluminium, and mining companies tied to industrial and infrastructure demand." },
  { key: "cement", name: "Cement", description: "Building-material producers riding India's construction and housing cycle." },
  { key: "infra", name: "Infrastructure & Construction", description: "Engineering, construction, and infrastructure-development conglomerates." },
  { key: "power", name: "Power & Utilities", description: "Generation, transmission, and distribution utilities powering the grid." },
  { key: "telecom", name: "Telecom", description: "Mobile network operators and telecom infrastructure providers." },
  { key: "durables", name: "Consumer Durables", description: "Appliance, electronics, and durable-goods manufacturers." },
  { key: "realty", name: "Realty", description: "Residential and commercial real-estate developers." },
  { key: "media", name: "Media & Entertainment", description: "Broadcasting, television, and cinema exhibition businesses." },
  { key: "retail", name: "Retail", description: "Organized retail chains and quick-service restaurant operators." },
  { key: "chemicals", name: "Chemicals", description: "Specialty and agro-chemical manufacturers serving industrial supply chains." },
  { key: "aviation", name: "Aviation", description: "Commercial airline operators connecting Indian and international routes." },
  { key: "ports", name: "Ports & Logistics", description: "Port operators and logistics companies moving India's trade." },
  { key: "paints", name: "Paints & Coatings", description: "Decorative and industrial paint manufacturers." },
  { key: "healthcare", name: "Healthcare Services", description: "Hospital chains and diagnostic-led healthcare providers." },
  { key: "capgoods", name: "Capital Goods & Industrials", description: "Industrial equipment, electricals, and defence manufacturers." },
  { key: "datacenters", name: "Data Centers", description: "Digital-infrastructure providers building the colocation, cloud, and connectivity backbone behind India's data boom." },
  { key: "toys", name: "Toys & Games", description: "A small but growing listed segment making toys and outdoor play equipment for Indian and export markets." },
];

const sectorName = (key: string) => sectors.find((s) => s.key === key)!.name;

// [symbol, name, sectorKey, domain, capTier, yahooSymbolOverride?]
type RawStock = [string, string, string, string, CapTier, string?];

const raw: RawStock[] = [
  // Information Technology
  ["TCS", "Tata Consultancy Services", "it", "www.tcs.com", "Large"],
  ["INFY", "Infosys", "it", "infosys.com", "Large"],
  ["WIPRO", "Wipro", "it", "wipro.com", "Large"],
  ["HCLTECH", "HCL Technologies", "it", "hcltech.com", "Large"],
  ["TECHM", "Tech Mahindra", "it", "techmahindra.com", "Large"],
  ["LTIM", "LTIMindtree", "it", "ltimindtree.com", "Mid"],
  ["MPHASIS", "Mphasis", "it", "mphasis.com", "Mid"],
  ["PERSISTENT", "Persistent Systems", "it", "persistent.com", "Mid"],
  ["COFORGE", "Coforge", "it", "coforge.com", "Mid"],
  ["LTTS", "L&T Technology Services", "it", "ltts.com", "Mid"],
  ["OFSS", "Oracle Financial Services Software", "it", "oracle.com", "Mid"],
  ["KPITTECH", "KPIT Technologies", "it", "kpit.com", "Mid"],
  ["ZENSARTECH", "Zensar Technologies", "it", "zensar.com", "Small"],
  ["SONATSOFTW", "Sonata Software", "it", "sonata-software.com", "Small"],
  ["NEWGEN", "Newgen Software Technologies", "it", "newgensoft.com", "Small"],
  ["ROUTE", "Route Mobile", "it", "routemobile.com", "Small"],
  ["FSL", "Firstsource Solutions", "it", "firstsource.com", "Small"],

  // Banking
  ["HDFCBANK", "HDFC Bank", "banking", "hdfcbank.com", "Large"],
  ["ICICIBANK", "ICICI Bank", "banking", "icicibank.com", "Large"],
  ["SBIN", "State Bank of India", "banking", "sbi.bank.in", "Large"],
  ["KOTAKBANK", "Kotak Mahindra Bank", "banking", "kotak.com", "Large"],
  ["AXISBANK", "Axis Bank", "banking", "axisbank.com", "Large"],
  ["INDUSINDBK", "IndusInd Bank", "banking", "indusind.com", "Large"],
  ["BANKBARODA", "Bank of Baroda", "banking", "bankofbaroda.in", "Large"],
  ["PNB", "Punjab National Bank", "banking", "pnbindia.in", "Mid"],
  ["IDFCFIRSTB", "IDFC First Bank", "banking", "idfcfirstbank.com", "Mid"],
  ["FEDERALBNK", "Federal Bank", "banking", "federalbank.co.in", "Mid"],
  ["AUBANK", "AU Small Finance Bank", "banking", "aubank.in", "Mid"],
  ["BANDHANBNK", "Bandhan Bank", "banking", "bandhanbank.com", "Mid"],
  ["YESBANK", "Yes Bank", "banking", "yesbank.in", "Mid"],
  ["RBLBANK", "RBL Bank", "banking", "rblbank.com", "Small"],
  ["CANBK", "Canara Bank", "banking", "canarabank.com", "Large"],
  ["UNIONBANK", "Union Bank of India", "banking", "unionbankofindia.co.in", "Mid"],
  ["INDIANB", "Indian Bank", "banking", "indianbank.in", "Mid"],
  ["BANKINDIA", "Bank of India", "banking", "bankofindia.co.in", "Mid"],
  ["MAHABANK", "Bank of Maharashtra", "banking", "bankofmaharashtra.in", "Mid"],
  ["KARURVYSYA", "Karur Vysya Bank", "banking", "kvb.co.in", "Small"],
  ["CUB", "City Union Bank", "banking", "cityunionbank.com", "Small"],
  ["DCBBANK", "DCB Bank", "banking", "dcbbank.com", "Small"],

  // NBFC & Financial Services
  ["BAJFINANCE", "Bajaj Finance", "nbfc", "bajajfinserv.in", "Large"],
  ["BAJAJFINSV", "Bajaj Finserv", "nbfc", "bajajfinserv.in", "Large"],
  ["CHOLAFIN", "Cholamandalam Investment", "nbfc", "cholamandalam.com", "Mid"],
  ["MUTHOOTFIN", "Muthoot Finance", "nbfc", "muthootfinance.com", "Mid"],
  ["PFC", "Power Finance Corporation", "nbfc", "pfcindia.com", "Mid"],
  ["RECLTD", "REC Limited", "nbfc", "recindia.gov.in", "Mid"],
  ["LICHSGFIN", "LIC Housing Finance", "nbfc", "lichousing.com", "Mid"],
  ["SHRIRAMFIN", "Shriram Finance", "nbfc", "shriramfinance.in", "Mid"],
  ["SBICARD", "SBI Cards & Payments", "nbfc", "sbicard.com", "Mid"],
  ["MFSL", "Max Financial Services", "nbfc", "maxlifeinsurance.com", "Mid"],
  ["MANAPPURAM", "Manappuram Finance", "nbfc", "manappuram.com", "Mid"],
  ["IIFL", "IIFL Finance", "nbfc", "iifl.com", "Mid"],
  ["POONAWALLA", "Poonawalla Fincorp", "nbfc", "poonawallafincorp.com", "Mid"],
  ["M&MFIN", "Mahindra & Mahindra Financial Services", "nbfc", "mahindrafinance.com", "Mid"],
  ["CREDITACC", "CreditAccess Grameen", "nbfc", "creditaccessgrameen.in", "Small"],
  ["FIVESTAR", "Five-Star Business Finance", "nbfc", "fivestargroup.in", "Small"],
  ["AAVAS", "Aavas Financiers", "nbfc", "aavas.in", "Small"],
  ["TATACAPITAL", "Tata Capital", "nbfc", "tatacapital.com", "Large", "TATACAP.NS"],

  // Insurance
  ["HDFCLIFE", "HDFC Life Insurance", "insurance", "hdfclife.com", "Large"],
  ["SBILIFE", "SBI Life Insurance", "insurance", "sbilife.co.in", "Large"],
  ["ICICIPRULI", "ICICI Prudential Life", "insurance", "iciciprulife.com", "Mid"],
  ["ICICIGI", "ICICI Lombard General Insurance", "insurance", "icicilombard.com", "Mid"],
  ["GICRE", "General Insurance Corporation", "insurance", "gicofindia.com", "Small"],
  ["NIACL", "New India Assurance", "insurance", "newindia.co.in", "Mid"],
  ["LICI", "Life Insurance Corporation of India", "insurance", "licindia.in", "Large"],
  ["STARHEALTH", "Star Health and Allied Insurance", "insurance", "starhealth.in", "Mid"],
  ["GODIGIT", "Go Digit General Insurance", "insurance", "godigit.com", "Mid"],
  ["NIVABUPA", "Niva Bupa Health Insurance", "insurance", "nivabupa.com", "Small"],

  // Energy & Petrochemicals
  ["RELIANCE", "Reliance Industries", "energy", "ril.com", "Large"],
  ["ONGC", "Oil & Natural Gas Corporation", "energy", "ongcindia.com", "Large"],
  ["IOC", "Indian Oil Corporation", "energy", "iocl.com", "Large"],
  ["BPCL", "Bharat Petroleum", "energy", "bharatpetroleum.in", "Large"],
  ["HINDPETRO", "Hindustan Petroleum", "energy", "hindustanpetroleum.com", "Mid"],
  ["GAIL", "GAIL India", "energy", "gailonline.com", "Large"],
  ["OIL", "Oil India", "energy", "oil-india.com", "Small"],
  ["PETRONET", "Petronet LNG", "energy", "petronetlng.com", "Mid"],
  ["MRPL", "Mangalore Refinery and Petrochemicals", "energy", "mrpl.co.in", "Small"],
  ["IGL", "Indraprastha Gas", "energy", "iglonline.net", "Mid"],
  ["MGL", "Mahanagar Gas", "energy", "mahanagargas.com", "Small"],
  ["GUJGASLTD", "Gujarat Gas", "energy", "gujaratgas.com", "Mid"],
  ["ATGL", "Adani Total Gas", "energy", "adanigas.com", "Mid"],
  ["GSPL", "Gujarat State Petronet", "energy", "gujaratstatepetronet.com", "Small"],

  // FMCG
  ["HINDUNILVR", "Hindustan Unilever", "fmcg", "hul.co.in", "Large"],
  ["ITC", "ITC Limited", "fmcg", "itcportal.com", "Large"],
  ["NESTLEIND", "Nestle India", "fmcg", "nestle.in", "Large"],
  ["BRITANNIA", "Britannia Industries", "fmcg", "britannia.co.in", "Large"],
  ["DABUR", "Dabur India", "fmcg", "dabur.com", "Large"],
  ["GODREJCP", "Godrej Consumer Products", "fmcg", "godrejcp.com", "Large"],
  ["MARICO", "Marico", "fmcg", "marico.com", "Mid"],
  ["COLPAL", "Colgate-Palmolive India", "fmcg", "colgatepalmolive.co.in", "Mid"],
  ["TATACONSUM", "Tata Consumer Products", "fmcg", "tataconsumer.com", "Large"],
  ["VBL", "Varun Beverages", "fmcg", "varunbeverages.com", "Mid"],
  ["EMAMILTD", "Emami", "fmcg", "emamiltd.in", "Mid"],
  ["UBL", "United Breweries", "fmcg", "unitedbreweries.com", "Mid"],
  ["UNITDSPR", "United Spirits", "fmcg", "unitedspirits.in", "Mid"],
  ["RADICO", "Radico Khaitan", "fmcg", "radicokhaitan.com", "Mid"],
  ["PATANJALI", "Patanjali Foods", "fmcg", "patanjalifoods.com", "Mid"],
  ["BIKAJI", "Bikaji Foods International", "fmcg", "bikaji.com", "Small"],
  ["GILLETTE", "Gillette India", "fmcg", "gillette.co.in", "Mid"],

  // Automobile
  ["MARUTI", "Maruti Suzuki", "auto", "marutisuzuki.com", "Large"],
  ["TATAMOTORS", "Tata Motors", "auto", "tatamotors.com", "Large", "TMPV.NS"],
  ["M&M", "Mahindra & Mahindra", "auto", "mahindra.com", "Large"],
  ["BAJAJ-AUTO", "Bajaj Auto", "auto", "bajajauto.com", "Mid"],
  ["EICHERMOT", "Eicher Motors", "auto", "eichermotors.com", "Large"],
  ["HEROMOTOCO", "Hero MotoCorp", "auto", "heromotocorp.com", "Large"],
  ["TVSMOTOR", "TVS Motor Company", "auto", "tvsmotor.com", "Mid"],
  ["ASHOKLEY", "Ashok Leyland", "auto", "ashokleyland.com", "Mid"],
  ["MOTHERSON", "Samvardhana Motherson", "auto", "motherson.com", "Mid"],
  ["BOSCHLTD", "Bosch Limited", "auto", "bosch.in", "Mid"],
  ["MRF", "MRF Limited", "auto", "mrftyres.com", "Large"],
  ["APOLLOTYRE", "Apollo Tyres", "auto", "apollotyres.com", "Mid"],
  ["BALKRISIND", "Balkrishna Industries", "auto", "bkt-tires.com", "Mid"],
  ["EXIDEIND", "Exide Industries", "auto", "exideindustries.com", "Mid"],
  ["AMARAJABAT", "Amara Raja Energy & Mobility", "auto", "amararajaenergy.com", "Mid", "ARE&M.NS"],
  ["SONACOMS", "Sona BLW Precision Forgings", "auto", "sonagroup.com", "Mid"],
  ["UNOMINDA", "UNO Minda", "auto", "unominda.com", "Mid"],
  ["TIINDIA", "Tube Investments of India", "auto", "tii.murugappa.com", "Mid"],

  // Pharmaceuticals
  ["SUNPHARMA", "Sun Pharmaceutical", "pharma", "sunpharma.com", "Large"],
  ["DRREDDY", "Dr. Reddy's Laboratories", "pharma", "drreddys.com", "Large"],
  ["CIPLA", "Cipla", "pharma", "cipla.com", "Large"],
  ["DIVISLAB", "Divi's Laboratories", "pharma", "divislabs.com", "Large"],
  ["LUPIN", "Lupin", "pharma", "lupin.com", "Mid"],
  ["AUROPHARMA", "Aurobindo Pharma", "pharma", "aurobindo.com", "Mid"],
  ["TORNTPHARM", "Torrent Pharmaceuticals", "pharma", "torrentpharma.com", "Mid"],
  ["ALKEM", "Alkem Laboratories", "pharma", "alkemlabs.com", "Mid"],
  ["BIOCON", "Biocon", "pharma", "biocon.com", "Small"],
  ["ZYDUSLIFE", "Zydus Lifesciences", "pharma", "zyduslife.com", "Mid"],
  ["MANKIND", "Mankind Pharma", "pharma", "mankindpharma.com", "Large"],
  ["GLENMARK", "Glenmark Pharmaceuticals", "pharma", "glenmarkpharma.com", "Mid"],
  ["IPCALAB", "IPCA Laboratories", "pharma", "ipca.com", "Mid"],
  ["LAURUSLABS", "Laurus Labs", "pharma", "laauruslabs.com", "Mid"],
  ["GLAND", "Gland Pharma", "pharma", "gland.in", "Mid"],
  ["ABBOTINDIA", "Abbott India", "pharma", "abbott.co.in", "Mid"],
  ["AJANTPHARM", "Ajanta Pharma", "pharma", "ajantapharma.com", "Mid"],
  ["NATCOPHARM", "Natco Pharma", "pharma", "natcopharma.co.in", "Small"],

  // Metals & Mining
  ["TATASTEEL", "Tata Steel", "metals", "tatasteel.com", "Large"],
  ["JSWSTEEL", "JSW Steel", "metals", "jsw.in", "Large"],
  ["HINDALCO", "Hindalco Industries", "metals", "hindalco.com", "Large"],
  ["VEDL", "Vedanta", "metals", "vedantalimited.com", "Large"],
  ["SAIL", "Steel Authority of India", "metals", "sail.co.in", "Mid"],
  ["NMDC", "NMDC Limited", "metals", "nmdc.co.in", "Mid"],
  ["JINDALSTEL", "Jindal Steel & Power", "metals", "jindalsteelpower.com", "Mid"],
  ["COALINDIA", "Coal India", "metals", "coalindia.in", "Large"],
  ["NALCO", "National Aluminium Company", "metals", "nalcoindia.com", "Mid", "NATIONALUM.NS"],
  ["HINDZINC", "Hindustan Zinc", "metals", "hzlindia.com", "Large"],
  ["APLAPOLLO", "APL Apollo Tubes", "metals", "aplapollo.com", "Mid"],
  ["JSL", "Jindal Stainless", "metals", "jindalstainless.com", "Mid"],
  ["WELCORP", "Welspun Corp", "metals", "welspuncorp.com", "Small"],
  ["RATNAMANI", "Ratnamani Metals & Tubes", "metals", "ratnamani.com", "Small"],

  // Cement
  ["ULTRACEMCO", "UltraTech Cement", "cement", "ultratechcement.com", "Large"],
  ["SHREECEM", "Shree Cement", "cement", "shreecement.com", "Mid"],
  ["AMBUJACEM", "Ambuja Cements", "cement", "ambujacement.com", "Mid"],
  ["ACC", "ACC Limited", "cement", "acclimited.com", "Mid"],
  ["DALBHARAT", "Dalmia Bharat", "cement", "dalmiabharat.com", "Mid"],
  ["JKCEMENT", "JK Cement", "cement", "jkcement.com", "Mid"],
  ["RAMCOCEM", "The Ramco Cements", "cement", "ramcocements.in", "Mid"],
  ["NUVOCO", "Nuvoco Vistas", "cement", "nuvoco.com", "Small"],
  ["JKLAKSHMI", "JK Lakshmi Cement", "cement", "jklakshmicement.com", "Small"],
  ["HEIDELBERG", "HeidelbergCement India", "cement", "heidelbergcement.co.in", "Small"],

  // Infrastructure & Construction
  ["LT", "Larsen & Toubro", "infra", "larsentoubro.com", "Large"],
  ["GMRINFRA", "GMR Airports Infrastructure", "infra", "gmrgroup.in", "Small", "GMRAIRPORT.NS"],
  ["IRB", "IRB Infrastructure", "infra", "irb.co.in", "Small"],
  ["NBCC", "NBCC (India)", "infra", "nbccindia.in", "Small"],
  ["RVNL", "Rail Vikas Nigam", "infra", "rvnl.org", "Small"],
  ["KEC", "KEC International", "infra", "kecrpg.com", "Mid"],
  ["ADANIENT", "Adani Enterprises", "infra", "adanienterprises.com", "Large"],
  ["PNCINFRA", "PNC Infratech", "infra", "pncinfratech.com", "Small"],
  ["KNRCON", "KNR Constructions", "infra", "knrcl.com", "Small"],
  ["GRINFRA", "G R Infraprojects", "infra", "grinfra.com", "Mid"],
  ["HCC", "Hindustan Construction Company", "infra", "hccindia.com", "Small"],

  // Power & Utilities
  ["NTPC", "NTPC Limited", "power", "ntpc.co.in", "Large"],
  ["POWERGRID", "Power Grid Corporation", "power", "powergrid.in", "Large"],
  ["TATAPOWER", "Tata Power", "power", "tatapower.com", "Mid"],
  ["ADANIPOWER", "Adani Power", "power", "adanipower.com", "Small"],
  ["NHPC", "NHPC Limited", "power", "nhpcindia.com", "Mid"],
  ["SJVN", "SJVN Limited", "power", "sjvn.nic.in", "Small"],
  ["ADANIENSOL", "Adani Energy Solutions", "power", "adanienergysolutions.com", "Mid"],
  ["TORNTPOWER", "Torrent Power", "power", "torrentpower.com", "Mid"],
  ["CESC", "CESC Limited", "power", "cesc.co.in", "Small"],
  ["JSWENERGY", "JSW Energy", "power", "jsw.in", "Mid"],
  ["IREDA", "Indian Renewable Energy Development Agency", "power", "ireda.in", "Mid"],

  // Telecom
  ["BHARTIARTL", "Bharti Airtel", "telecom", "airtel.in", "Large"],
  ["IDEA", "Vodafone Idea", "telecom", "myvi.in", "Small"],
  ["INDUSTOWER", "Indus Towers", "telecom", "industowers.com", "Small"],
  ["HFCL", "HFCL Limited", "telecom", "hfcl.com", "Small"],
  ["STLTECH", "Sterlite Technologies", "telecom", "stl.tech", "Small"],

  // Consumer Durables
  ["TITAN", "Titan Company", "durables", "titancompany.in", "Large"],
  ["HAVELLS", "Havells India", "durables", "havells.com", "Large"],
  ["VOLTAS", "Voltas", "durables", "voltas.com", "Mid"],
  ["CROMPTON", "Crompton Greaves Consumer", "durables", "crompton.co.in", "Small"],
  ["DIXON", "Dixon Technologies", "durables", "dixoninfo.com", "Mid"],
  ["BLUESTARCO", "Blue Star", "durables", "bluestarindia.com", "Small"],
  ["WHIRLPOOL", "Whirlpool of India", "durables", "whirlpoolindia.com", "Small"],
  ["VGUARD", "V-Guard Industries", "durables", "vguard.in", "Small"],
  ["ORIENTELEC", "Orient Electric", "durables", "orientelectric.com", "Small"],
  ["SYMPHONY", "Symphony Limited", "durables", "symphonylimited.com", "Small"],
  ["CERA", "Cera Sanitaryware", "durables", "cera-india.com", "Small"],

  // Realty
  ["DLF", "DLF Limited", "realty", "dlf.in", "Large"],
  ["GODREJPROP", "Godrej Properties", "realty", "godrejproperties.com", "Mid"],
  ["OBEROIRLTY", "Oberoi Realty", "realty", "oberoirealty.com", "Mid"],
  ["PRESTIGE", "Prestige Estates Projects", "realty", "prestigeconstructions.com", "Small"],
  ["PHOENIXLTD", "Phoenix Mills", "realty", "thephoenixmills.com", "Small"],
  ["SOBHA", "Sobha Limited", "realty", "sobha.com", "Small"],
  ["BRIGADE", "Brigade Enterprises", "realty", "brigadegroup.com", "Small"],
  ["MAHLIFE", "Mahindra Lifespace Developers", "realty", "mahindralifespaces.com", "Small"],
  ["SUNTECK", "Sunteck Realty", "realty", "sunteckindia.com", "Small"],
  ["LODHA", "Macrotech Developers (Lodha)", "realty", "lodhagroup.com", "Large"],

  // Media & Entertainment
  ["SUNTV", "Sun TV Network", "media", "suntv.in", "Mid"],
  ["ZEEL", "Zee Entertainment Enterprises", "media", "zee.com", "Small"],
  ["PVRINOX", "PVR INOX", "media", "pvrinox.in", "Small"],
  ["NAZARA", "Nazara Technologies", "media", "nazara.com", "Small"],
  ["SAREGAMA", "Saregama India", "media", "saregama.com", "Small"],
  ["NETWORK18", "Network18 Media & Investments", "media", "network18online.com", "Small"],

  // Retail
  ["DMART", "Avenue Supermarts (DMart)", "retail", "dmartindia.com", "Large"],
  ["TRENT", "Trent Limited", "retail", "trentlimited.com", "Large"],
  ["ABFRL", "Aditya Birla Fashion & Retail", "retail", "abfrl.com", "Small"],
  ["JUBLFOOD", "Jubilant FoodWorks", "retail", "jubilantfoodworks.com", "Mid"],
  ["VMART", "V-Mart Retail", "retail", "vmartretail.com", "Small"],
  ["SHOPERSTOP", "Shoppers Stop", "retail", "shoppersstop.com", "Small"],
  ["METROBRAND", "Metro Brands", "retail", "metrobrands.com", "Mid"],
  ["DEVYANI", "Devyani International", "retail", "devyaniinternational.com", "Mid"],
  ["WESTLIFE", "Westlife Foodworld", "retail", "westlife.co.in", "Small"],

  // Chemicals
  ["PIDILITIND", "Pidilite Industries", "chemicals", "pidilite.com", "Large"],
  ["SRF", "SRF Limited", "chemicals", "srf.com", "Large"],
  ["UPL", "UPL Limited", "chemicals", "upl-ltd.com", "Mid"],
  ["AARTIIND", "Aarti Industries", "chemicals", "aartiindustries.com", "Small"],
  ["DEEPAKNTR", "Deepak Nitrite", "chemicals", "deepaknitrite.com", "Small"],
  ["TATACHEM", "Tata Chemicals", "chemicals", "tatachemicals.com", "Mid"],
  ["NAVINFLUOR", "Navin Fluorine International", "chemicals", "navinfluorine.com", "Mid"],
  ["VINATIORGA", "Vinati Organics", "chemicals", "vinatiorganics.com", "Mid"],
  ["CLEAN", "Clean Science and Technology", "chemicals", "cleanscience.co.in", "Small"],
  ["FLUOROCHEM", "Gujarat Fluorochemicals", "chemicals", "gfl.co.in", "Mid"],
  ["ALKYLAMINE", "Alkyl Amines Chemicals", "chemicals", "alkylamines.com", "Small"],

  // Aviation
  ["INDIGO", "InterGlobe Aviation (IndiGo)", "aviation", "goindigo.in", "Large"],
  ["SPICEJET", "SpiceJet", "aviation", "spicejet.com", "Small", "SPICEJET.BO"],

  // Ports & Logistics
  ["ADANIPORTS", "Adani Ports & SEZ", "ports", "adaniports.com", "Large"],
  ["CONCOR", "Container Corporation of India", "ports", "concorindia.co.in", "Mid"],
  ["GESHIP", "Great Eastern Shipping", "ports", "greatship.com", "Small"],
  ["BLUEDART", "Blue Dart Express", "ports", "bluedart.com", "Small"],
  ["DELHIVERY", "Delhivery", "ports", "delhivery.com", "Mid"],
  ["TCI", "Transport Corporation of India", "ports", "tcil.com", "Small"],

  // Paints & Coatings
  ["ASIANPAINT", "Asian Paints", "paints", "asianpaints.com", "Large"],
  ["BERGEPAINT", "Berger Paints India", "paints", "bergerpaints.com", "Mid"],
  ["KANSAINER", "Kansai Nerolac Paints", "paints", "nerolac.com", "Small"],
  ["INDIGOPNTS", "Indigo Paints", "paints", "indigopaints.com", "Small"],

  // Healthcare Services
  ["APOLLOHOSP", "Apollo Hospitals Enterprise", "healthcare", "apollohospitals.com", "Large"],
  ["MAXHEALTH", "Max Healthcare Institute", "healthcare", "maxhealthcare.in", "Mid"],
  ["FORTIS", "Fortis Healthcare", "healthcare", "fortishealthcare.com", "Mid"],
  ["NH", "Narayana Hrudayalaya", "healthcare", "narayanahealth.org", "Mid"],
  ["METROPOLIS", "Metropolis Healthcare", "healthcare", "metropolisindia.com", "Small"],
  ["LALPATHLAB", "Dr. Lal PathLabs", "healthcare", "lalpathlabs.com", "Mid"],
  ["KIMS", "Krishna Institute of Medical Sciences", "healthcare", "kimshospitals.com", "Mid"],
  ["RAINBOW", "Rainbow Children's Medicare", "healthcare", "rainbowhospitals.in", "Small"],
  ["GLOBALHEALTH", "Global Health (Medanta)", "healthcare", "medanta.org", "Mid", "MEDANTA.NS"],

  // Capital Goods & Industrials
  ["SIEMENS", "Siemens India", "capgoods", "siemens.co.in", "Large"],
  ["ABB", "ABB India", "capgoods", "abb.com", "Large"],
  ["CUMMINSIND", "Cummins India", "capgoods", "cummins.com", "Mid"],
  ["BHEL", "Bharat Heavy Electricals", "capgoods", "bhel.com", "Small"],
  ["HAL", "Hindustan Aeronautics", "capgoods", "hal-india.co.in", "Large"],
  ["BEL", "Bharat Electronics", "capgoods", "bel-india.in", "Large"],
  ["THERMAX", "Thermax Limited", "capgoods", "thermaxglobal.com", "Mid"],
  ["AIAENG", "AIA Engineering", "capgoods", "aiaengineering.com", "Mid"],
  ["SKFINDIA", "SKF India", "capgoods", "skf.com", "Small"],
  ["CGPOWER", "CG Power and Industrial Solutions", "capgoods", "cgglobal.com", "Mid"],
  ["MAZDOCK", "Mazagon Dock Shipbuilders", "capgoods", "mazagondock.in", "Mid"],
  ["COCHINSHIP", "Cochin Shipyard", "capgoods", "cochinshipyard.in", "Mid"],
  ["POLYCAB", "Polycab India", "capgoods", "polycab.com", "Large"],

  // Data Centers
  ["TATACOMM", "Tata Communications", "datacenters", "tatacommunications.com", "Large"],
  ["RAILTEL", "RailTel Corporation of India", "datacenters", "railtel.in", "Small"],
  ["NETWEB", "Netweb Technologies India", "datacenters", "netwebindia.com", "Small"],
  ["ANANTRAJ", "Anant Raj Limited", "datacenters", "anantrajlimited.com", "Mid"],

  // Toys & Games
  ["OKPLAY", "Ok Play India", "toys", "okplayindia.com", "Small", "OKPLA.BO"],
  ["KVTOYS", "K.V. Toys India", "toys", "kvtoysindia.com", "Small", "KVTOYS.BO"],
];

export const indianStocks: StockMeta[] = raw.map(([symbol, name, sectorKey, domain, capTier, yahooOverride]) => ({
  symbol,
  yahooSymbol: yahooOverride ?? `${symbol}.NS`,
  name,
  sector: sectorName(sectorKey),
  domain,
  capTier,
}));

export function companyLogoUrl(domain: string, size = 64) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}
