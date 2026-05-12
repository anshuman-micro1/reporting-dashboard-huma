/**
 * seed_members.js
 * ===============
 * Fetches all pages from the Hubstaff members endpoint and upserts
 * each member into the `hubstaff.members` MongoDB collection with
 * their hubstaffId, name, personalEmail, and micro1Email.
 *
 * Usage:
 *   node seed_members.js
 */

require("dotenv").config();
const axios = require("axios");
const { MongoClient } = require("mongodb");

// ─────────────────────────────────────────────────────────────
// ENV — move these to a .env file and load with dotenv
// ─────────────────────────────────────────────────────────────

const ORG_ID = process.env.HUBSTAFF_ORG_ID || "359758";

// Hubstaff session tokens — refresh from browser DevTools when expired
const HUBSTAFF_CSRF_HEADER_TOKEN = process.env.HUBSTAFF_CSRF_HEADER_TOKEN || "JvnWsDEJRVvem5AZA16GUAMB5McNSTHnxlMqJyzex7S4QjXvMie5ZMstiw2PU5iKCRkxH_1WBd-LuZ6vPVvHvw";
const HUBSTAFF_STRIPE_MID        = process.env.HUBSTAFF_STRIPE_MID        || "995379a6-03c9-44da-9ba3-2c0b1bede6f54b852d";
const HUBSTAFF_XSRF_TOKEN        = process.env.HUBSTAFF_XSRF_TOKEN        || "lE_ku3_ftG1Tm0Fn25b3YzWwd5zKJbhPlqrayJAs2lQK9AfkfPFIUkYtWnNXm-m5P6iiRDo6jHfbQG5AganaXw";
const HUBSTAFF_SESSION           = process.env.HUBSTAFF_SESSION           || "4LrAbnLonw%2BnHrgmqTsHTjYF78mQAWdAqQlBB%2FqIPJiYDontJCGSDOY%2B0AQSLSJs857hXAGjDu7IZ3DWzs2gUHBFX1mdrtjnqKp95Ict7N7v1q2EEGcrQBVdqiEacnbIaWqx7xM6vaMmmvy5dl4fGCVWC4tq--Djit0v2CjGGWOFUW--7NFLyd017JU83N02Q1lbPg%3D%3D";
const HUBSTAFF_ACCOUNT_REFRESH   = process.env.HUBSTAFF_ACCOUNT_REFRESH   || "1778481720238";
const HUBSTAFF_CFUVID            = process.env.HUBSTAFF_CFUVID            || "ALd7DMrASRTC.MtrDlIUdqjEONeSWR34ROnqsEbYx9Q-1778418335.2486796-1.0.1.1-BZiO0HaAiVVYG7XBPF.JV7fDKFBABcgmsOxWIwgYC8E";
const HUBSTAFF_INGRESS_COOKIE    = process.env.HUBSTAFF_INGRESS_COOKIE    || "1778475358.81.36.422254|c4965ee8e4e13e9c86477fb702d05122";

const MONGO_URI        = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_DB         = process.env.MONGO_DB  || "hubstaff";
const MONGO_COLLECTION = "members";

// ─────────────────────────────────────────────────────────────
// DERIVED CONSTANTS
// ─────────────────────────────────────────────────────────────

const MEMBERS_URL = `https://app.hubstaff.com/reports/${ORG_ID}/members.json`;

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: `https://app.hubstaff.com/reports/${ORG_ID}/team/daily`,
  "X-CSRF-Token": HUBSTAFF_CSRF_HEADER_TOKEN,
  "Content-Type": "application/json",
  "X-Requested-With": "XMLHttpRequest",
  Origin: "https://app.hubstaff.com",
  Connection: "keep-alive",
  DNT: "1",
  Cookie: [
    `organization=${ORG_ID}`,
    `__stripe_mid=${HUBSTAFF_STRIPE_MID}`,
    `XSRF-TOKEN=${HUBSTAFF_XSRF_TOKEN}`,
    `_hubstaff_session=${HUBSTAFF_SESSION}`,
    `hubstaff_account_refresh=${HUBSTAFF_ACCOUNT_REFRESH}`,
    `_cfuvid=${HUBSTAFF_CFUVID}`,
    `INGRESSCOOKIE=${HUBSTAFF_INGRESS_COOKIE}`,
  ].join("; "),
};

const REQUEST_BODY = {
  search: "",
  filters: { removed_after: "2026-04-24" },
  selected_only: false,
  selection: [],
  selection_type: "select_all",
};

// ─────────────────────────────────────────────────────────────
// MEMBER DIRECTORY  (name + emails from the team spreadsheet)
// ─────────────────────────────────────────────────────────────

const MEMBER_DIRECTORY = [
  { name: "Aafes Thairu", personalEmail: "aafes.thairu@gmail.com", micro1Email: "aath142@expert.micro1.ai" },
  { name: "ABDULROQEEB ARIWOOLA", personalEmail: "ariwoolaabdulroqeeb@gmail.com", micro1Email: "aa363@expert.micro1.ai" },
  { name: "Abolarinwa Sodipo", personalEmail: "sodipo.ea01@gmail.com", micro1Email: "abso082@expert.micro1.ai" },
  { name: "Abubakar Abbas", personalEmail: "abmattex@gmail.com", micro1Email: "abab119@expert.micro1.ai" },
  { name: "Adekanmi Adeyinka", personalEmail: "adekanmiadeyinka@gmail.com", micro1Email: "aa167@expert.micro1.ai" },
  { name: "Ahmad Jundi", personalEmail: "ahmadjundi19972999@gmail.com", micro1Email: "ahju517@expert.micro1.ai" },
  { name: "Ahmed ElMokaddem", personalEmail: "ahmed.elmokaddem@yahoo.com", micro1Email: "ahel872@expert.micro1.ai" },
  { name: "Akanksha Kajal", personalEmail: "kajalaksh8@gmail.com", micro1Email: "akka279@expert.micro1.ai" },
  { name: "Albana Gjuraj", personalEmail: "albana.gj1@gmail.com", micro1Email: "ag626@expert.micro1.ai" },
  { name: "ALI ABOSAMRA", personalEmail: "aliabousamra90@gmail.com", micro1Email: "alab099@expert.micro1.ai" },
  { name: "Aline Magno", personalEmail: "alinelmm@gmail.com", micro1Email: "alma574@expert.micro1.ai" },
  { name: "Alisha Spayth", personalEmail: "spayth.aaron@gmail.com", micro1Email: "as722@expert.micro1.ai" },
  { name: "Aly Naqvi", personalEmail: "an@morphemestudios.com", micro1Email: "gx863@expert.micro1.ai" },
  { name: "Amy Rogers", personalEmail: "amrog84@gmail.com", micro1Email: "ar488@expert.micro1.ai" },
  { name: "Andrea Mobley", personalEmail: "mobleyandrea91@gmail.com", micro1Email: "am435@expert.micro1.ai" },
  { name: "Andrea Venegas", personalEmail: "avenegaszeledon@gmail.com", micro1Email: "anve385@expert.micro1.ai" },
  { name: "Andrew Paul", personalEmail: "computingconsultancy@andrewpaul.co", micro1Email: "anpa049@expert.micro1.ai" },
  { name: "Ankit handa", personalEmail: "ankithanda2009@gmail.com", micro1Email: "anha740@expert.micro1.ai" },
  { name: "Annabelle Adams", personalEmail: "sailor3688ann@gmail.com", micro1Email: "anad921@expert.micro1.ai" },
  { name: "Antonella Grossolano", personalEmail: "anto.grossolano@gmail.com", micro1Email: "ag101@expert.micro1.ai" },
  { name: "Aritra Chatterjee", personalEmail: "aritra1807@gmail.com", micro1Email: "arch714@expert.micro1.ai" },
  { name: "Arshad Ali", personalEmail: "arshadali2006@gmail.com", micro1Email: "aral740@expert.micro1.ai" },
  { name: "Asanda Cwayi", personalEmail: "acwayi@gmail.com", micro1Email: "ascw159@expert.micro1.ai" },
  { name: "Ashley Simpson", personalEmail: "readinghcc@gmail.com", micro1Email: "as168@expert.micro1.ai" },
  { name: "Avedis Ekmekjian", personalEmail: "avedisekmekjian@gmail.com", micro1Email: "ae727@expert.micro1.ai" },
  { name: "Babafemi Olayinka", personalEmail: "babafemi.olayinka@gmail.com", micro1Email: "baol465@expert.micro1.ai" },
  { name: "Bingi Jagadeesh", personalEmail: "jagadeesh8500@gmail.com", micro1Email: "gx912@expert.micro1.ai" },
  { name: "Chinonso Nwanevu", personalEmail: "chnwa48@morgan.edu", micro1Email: "cn216@expert.micro1.ai" },
  { name: "Christina Fredrick", personalEmail: "cbfredrick@gmail.com", micro1Email: "chfr903@expert.micro1.ai" },
  { name: "Christina Tilus", personalEmail: "ctilus@hotmail.com", micro1Email: "chti675@expert.micro1.ai" },
  { name: "Claudia Patricia Valenzuela Aceves", personalEmail: "claudia.valenzuela.aceves@gmail.com", micro1Email: "clva300@expert.micro1.ai" },
  { name: "Jarred Cornelissen", personalEmail: "cornelissenjarred@gmail.com", micro1Email: "jaco870@expert.micro1.ai" },
  { name: "Daniel Jenkinson", personalEmail: "djenkinson33forapple@gmail.com", micro1Email: "daje742@expert.micro1.ai" },
  { name: "Danielle Davis", personalEmail: "danie.davis05@gmail.com", micro1Email: "dd596@expert.micro1.ai" },
  { name: "Daria Shelton", personalEmail: "daria.amai.shelton@gmail.com", micro1Email: "dash140@expert.micro1.ai" },
  { name: "Dede Lori", personalEmail: "loridede0@gmail.com", micro1Email: "delo811@expert.micro1.ai" },
  { name: "Deepu Subramanian", personalEmail: "madebyheartist@gmail.com", micro1Email: "desu483@expert.micro1.ai" },
  { name: "Diane Bass", personalEmail: "diane.bass.design@gmail.com", micro1Email: "diba193@expert.micro1.ai" },
  { name: "Diego Castillo", personalEmail: "itaboranius@gmail.com", micro1Email: "dica476@expert.micro1.ai" },
  { name: "Dilip Mathuria", personalEmail: "dilip.mathuria@hotmail.com", micro1Email: "dima131@expert.micro1.ai" },
  { name: "Don Tomie", personalEmail: "dontomie@att.net", micro1Email: "dt247@expert.micro1.ai" },
  { name: "Doug Bailen", personalEmail: "dougbailen@gmail.com", micro1Email: "gx818@expert.micro1.ai" },
  { name: "Ebube Emechete", personalEmail: "theonlygreystudios@gmail.com", micro1Email: "thgr892@expert.micro1.ai" },
  { name: "Edwin Kariuki", personalEmail: "edwinmwangi4@gmail.com", micro1Email: "edka333@expert.micro1.ai" },
  { name: "Ellarene Cummings", personalEmail: "ellarenecummings@gmail.com", micro1Email: "ec542@expert.micro1.ai" },
  { name: "Emilia Augusta Rego", personalEmail: "jndesenvolvimento@gmail.com", micro1Email: "er278@expert.micro1.ai" },
  { name: "Emmanuel Antwi Adjei", personalEmail: "eantwiadjei@gmail.com", micro1Email: "ea552@expert.micro1.ai" },
  { name: "Eric Malek", personalEmail: "emalek@alumni.tufts.edu", micro1Email: "erma672@expert.micro1.ai" },
  { name: "Erica Switzer", personalEmail: "erica.switzer82@gmail.com", micro1Email: "ersw482@expert.micro1.ai" },
  { name: "Esther Ibizugbe", personalEmail: "esta140516@gmail.com", micro1Email: "esib916@expert.micro1.ai" },
  { name: "Evelyn Vanegas", personalEmail: "taty.jaimes111@gmail.com", micro1Email: "evva968@expert.micro1.ai" },
  { name: "Ezekiel Eniola Alabi", personalEmail: "alabi.eniola.ezekiel@gmail.com", micro1Email: "ezal009@expert.micro1.ai" },
  { name: "Faustine Oduol", personalEmail: "oduolfo@gmail.com", micro1Email: "faod159@expert.micro1.ai" },
  { name: "Femmy Lekan", personalEmail: "femiolaanalyst@gmail.com", micro1Email: "feol593@expert.micro1.ai" },
  { name: "Fernan Luna", personalEmail: "fernan.luna@vera.com.uy", micro1Email: "gx903@expert.micro1.ai" },
  { name: "Feron McGurrin", personalEmail: "feroncm@gmail.com", micro1Email: "femc110@expert.micro1.ai" },
  { name: "Filiz Canbaz", personalEmail: "filizcanbazff@gmail.com", micro1Email: "fica450@expert.micro1.ai" },
  { name: "Gabriel Israfil de Araujo Alves", personalEmail: "gabriel.israfil.alves@gmail.com", micro1Email: "gade945@expert.micro1.ai" },
  { name: "Gbade Okegbola", personalEmail: "gbadeokegbola@gmail.com", micro1Email: "gbok063@expert.micro1.ai" },
  { name: "Gibson Mzinda", personalEmail: "jalal.vashahi@gmail.com", micro1Email: "gx1126@expert.micro1.ai" },
  { name: "Greicy Espinoza", personalEmail: "espinoza.greicy@gmail.com", micro1Email: "gx973@expert.micro1.ai" },
  { name: "Gul Ozok Ayan", personalEmail: "ozokgul@gmail.com", micro1Email: "gx908@expert.micro1.ai" },
  { name: "Hasna Naziya", personalEmail: "hasnanaziya26@gmail.com", micro1Email: "hn02@expert.micro1.ai" },
  { name: "Hesham Elgamal", personalEmail: "heshamelgmal@gmail.com", micro1Email: "heel878@expert.micro1.ai" },
  { name: "Ikeade Adebowale", personalEmail: "adebowaleikeade6@gmail.com", micro1Email: "ia885@expert.micro1.ai" },
  { name: "Illia Pavliuk", personalEmail: "hf.jess@gmail.com", micro1Email: "ilpa282@expert.micro1.ai" },
  { name: "Imemfon Collins", personalEmail: "imemfoncollins@gmail.com", micro1Email: "imco545@expert.micro1.ai" },
  { name: "Innocent Ogbonna", personalEmail: "ocinnox@gmail.com", micro1Email: "inog726@expert.micro1.ai" },
  { name: "Jalal Vashahi", personalEmail: "jalal.vashahi@gmail.com", micro1Email: "gx1126@expert.micro1.ai" },
  { name: "Janette Špilak", personalEmail: "janettespilak@gmail.com", micro1Email: "japi344@expert.micro1.ai" },
  { name: "Jean Desire Habiyambere", personalEmail: "jeandesire.habiyambere1@gmail.com", micro1Email: "jeha997@expert.micro1.ai" },
  { name: "Jeffrey Frank", personalEmail: "jf@argosadvisory.net", micro1Email: "jefr825@expert.micro1.ai" },
  { name: "Jehu Lynch", personalEmail: "jalal.vashahi@gmail.com", micro1Email: "gx1126@expert.micro1.ai" },
  { name: "Jenny Farrell", personalEmail: "jennyfarrell0226@gmail.com", micro1Email: "jefa829@expert.micro1.ai" },
  { name: "Jephthah Aina", personalEmail: "jephthahaina@gmail.com", micro1Email: "jeai109@expert.micro1.ai" },
  { name: "Jeremy Verhey", personalEmail: "jeremy@verheygroup.com.au", micro1Email: "gx1127@expert.micro1.ai" },
  { name: "Joaquin Tejera", personalEmail: "joaquintejera98@gmail.com", micro1Email: "jt280@expert.micro1.ai" },
  { name: "Joe Halstead", personalEmail: "jshalstead@gmail.com", micro1Email: "jh675@expert.micro1.ai" },
  { name: "Joff Mills", personalEmail: "joff.mills@gmail.com", micro1Email: "jomi254@expert.micro1.ai" },
  { name: "Kaustav Mukherjee", personalEmail: "jojofmukherjee@gmail.com", micro1Email: "kamu696@expert.micro1.ai" },
  { name: "Jokin Auzmendi", personalEmail: "auzmendijokin@gmail.com", micro1Email: "joau864@expert.micro1.ai" },
  { name: "Jon Evers", personalEmail: "jonnyevers@icloud.com", micro1Email: "je122@expert.micro1.ai" },
  { name: "Jonathan Einav", personalEmail: "jonathan.einav@gmail.com", micro1Email: "je14@expert.micro1.ai" },
  { name: "Jonathan Sharp", personalEmail: "sharpj@gmail.com", micro1Email: "gx1129@expert.micro1.ai" },
  { name: "Jordan Cissell", personalEmail: "jordantc@gmail.com", micro1Email: "jc734@expert.micro1.ai" },
  { name: "Joseph Domagala", personalEmail: "domagalaj@yahoo.com", micro1Email: "jd309@expert.micro1.ai" },
  { name: "Josephine Cabrera", personalEmail: "josephinecabrera.94@gmail.com", micro1Email: "joca283@expert.micro1.ai" },
  { name: "Joshua Hartwell", personalEmail: "joshhartwell42@gmail.com", micro1Email: "joha089@expert.micro1.ai" },
  { name: "Joyce Kigoko", personalEmail: "kigokoj3@gmail.com", micro1Email: "joki478@expert.micro1.ai" },
  { name: "Juan Gutierrez", personalEmail: "guti.xsj@gmail.com", micro1Email: "jugu387@expert.micro1.ai" },
  { name: "Juliana Grael Lirio de Almeida", personalEmail: "juligrael@gmail.com", micro1Email: "jugr379@expert.micro1.ai" },
  { name: "Justin McKenzie", personalEmail: "justin@justinpossible.com", micro1Email: "jm017@expert.micro1.ai" },
  { name: "Kathryn Dench", personalEmail: "kate@diversearticulation.com", micro1Email: "kade081@expert.micro1.ai" },
  { name: "Kathryn Woolf", personalEmail: "woolf_k@yahoo.com", micro1Email: "kw474@expert.micro1.ai" },
  { name: "Kelvin Shani", personalEmail: "sirnare@gmail.com", micro1Email: "kesh930@expert.micro1.ai" },
  { name: "Kenneth Williams", personalEmail: "kenwilliamsjr.kwj@gmail.com", micro1Email: "dk701@expert.micro1.ai" },
  { name: "Kevin Harris", personalEmail: "cybergenx22@gmail.com", micro1Email: "kh750@expert.micro1.ai" },
  { name: "Kimberly Morrison", personalEmail: "ninjalady5500@gmail.com", micro1Email: "em955@expert.micro1.ai" },
  { name: "Krrish Chhablani", personalEmail: "pgp22.krrish@spjimr.org", micro1Email: "krch048@expert.micro1.ai" },
  { name: "Kwesi Kwofie", personalEmail: "mrkwesikwofie@gmail.com", micro1Email: "kwkw356@expert.micro1.ai" },
  { name: "Leila Davarpanah", personalEmail: "leiladavarpanah@gmail.com", micro1Email: "leda086@expert.micro1.ai" },
  { name: "Leslie Castanuela-Barnes", personalEmail: "lesliecastanuelabarnes@gmail.com", micro1Email: "lc927@expert.micro1.ai" },
  { name: "Lewis Corbett", personalEmail: "lewis.corbett@lutraengineering.co.uk", micro1Email: "gx919@expert.micro1.ai" },
  { name: "Liberty Takawira", personalEmail: "libertytakawira@gmail.com", micro1Email: "gx977@expert.micro1.ai" },
  { name: "lily.carriger@yahoo.com", personalEmail: "lily.carriger@yahoo.com", micro1Email: "lc506@expert.micro1.ai" },
  { name: "Lindsey Lennon", personalEmail: "lindseyllennon@gmail.com", micro1Email: "lile563@expert.micro1.ai" },
  { name: "Loucinda Copley", personalEmail: "loucinda_k@hotmail.com", micro1Email: "lc803@expert.micro1.ai" },
  { name: "Love Fehintola", personalEmail: "fehintolaloveadesola2004@gmail.com", micro1Email: "lofe698@expert.micro1.ai" },
  { name: "Lucia Baldo", personalEmail: "lulibaldo16@gmail.com", micro1Email: "luba455@expert.micro1.ai" },
  { name: "Luqman Lawal", personalEmail: "lllucmahn@gmail.com", micro1Email: "lula516@expert.micro1.ai" },
  { name: "Margaret Cotton", personalEmail: "mcotton_98@yahoo.com", micro1Email: "maco072@expert.micro1.ai" },
  { name: "Marium Mehdi", personalEmail: "mariummehdi94@gmail.com", micro1Email: "mm515@expert.micro1.ai" },
  { name: "Matthew Alan Hutton", personalEmail: "matt.hutton.mba@gmail.com", micro1Email: "mh753@expert.micro1.ai" },
  { name: "Mauricio Ramirez Arango", personalEmail: "mauricioramirezarq@gmail.com", micro1Email: "gx924@expert.micro1.ai" },
  { name: "Mercedes Didier Garnham", personalEmail: "mercedesdidiergarnham@gmail.com", micro1Email: "medi182@expert.micro1.ai" },
  { name: "Michal Bem", personalEmail: "michal.bem@gmail.com", micro1Email: "mibe903@expert.micro1.ai" },
  { name: "Michal Brachovec", personalEmail: "michalbrachovec@seznam.cz", micro1Email: "mb756@expert.micro1.ai" },
  { name: "Michelle Aniso", personalEmail: "michelledoubra@gmail.com", micro1Email: "mian548@expert.micro1.ai" },
  { name: "Michelle Browne", personalEmail: "mabrowne521@gmail.com", micro1Email: "mibr419@expert.micro1.ai" },
  { name: "Michelle Perez", personalEmail: "michelledoubra@gmail.com", micro1Email: "mp529@expert.micro1.ai" },
  { name: "Michelle Rose Villariez", personalEmail: "villariezmichelle@gmail.com", micro1Email: "mivi823@expert.micro1.ai" },
  { name: "Miguel Rojas", personalEmail: "di.miguelrojas343@gmail.com", micro1Email: "gx927@expert.micro1.ai" },
  { name: "Mihir Desai", personalEmail: "adminmihir@protonmail.com", micro1Email: "mide072@expert.micro1.ai" },
  { name: "Mihnea Vorovenci", personalEmail: "mihneavorovenci@gmail.com", micro1Email: "mv875@expert.micro1.ai" },
  { name: "Mohamad Hjeij", personalEmail: "mohamad.hjeij92@gmail.com", micro1Email: "mohj016@expert.micro1.ai" },
  { name: "Mohamed Mostafa", personalEmail: "mo7amedkhateeb97@gmail.com", micro1Email: "moib717@expert.micro1.ai" },
  { name: "Mohamed Shaheedullah", personalEmail: "conifer567@outlook.com", micro1Email: "mosh496@expert.micro1.ai" },
  { name: "Mohamed Zaid bin Mohamed Ismail", personalEmail: "aied6227@gmail.com", micro1Email: "mobi218@expert.micro1.ai" },
  { name: "Moreen Wanjohi", personalEmail: "moreennyambura85@gmail.com", micro1Email: "mowa208@expert.micro1.ai" },
  { name: "Myra Nizami", personalEmail: "myra.nizami@gmail.com", micro1Email: "myni768@expert.micro1.ai" },
  { name: "Nancy Lichtenstein", personalEmail: "nrlwrites@gmail.com", micro1Email: "nl139@expert.micro1.ai" },
  { name: "Nancy Sinclair", personalEmail: "nancy@nancysinclair.com", micro1Email: "nasi412@expert.micro1.ai" },
  { name: "Ndanganen Enock Tshidavhu", personalEmail: "etshidavhu@hotmail.com", micro1Email: "gx1115@expert.micro1.ai" },
  { name: "Nicole Goulding", personalEmail: "simply.gould@gmail.com", micro1Email: "nigo330@expert.micro1.ai" },
  { name: "Nina Bunkers", personalEmail: "nina.bunkers@gmail.com", micro1Email: "nb569@expert.micro1.ai" },
  { name: "Nmaju Noble Nmaju", personalEmail: "nmajunnmaju@gmail.com", micro1Email: "nmnm521@expert.micro1.ai" },
  { name: "Nune Khachatryan", personalEmail: "ninevehhevenin@gmail.com", micro1Email: "nukh841@expert.micro1.ai" },
  { name: "Olawale Opadisi", personalEmail: "opadisi@gmail.com", micro1Email: "olop604@expert.micro1.ai" },
  { name: "Oluwabukunmi Felix Awolola", personalEmail: "worksbyfelix@gmail.com", micro1Email: "olaw302@expert.micro1.ai" },
  { name: "Omnya Shakweer", personalEmail: "omnyashakweer@gmail.com", micro1Email: "omsh581@expert.micro1.ai" },
  { name: "Pablo Ivorra", personalEmail: "pablotion@hotmail.com", micro1Email: "paiv572@expert.micro1.ai" },
  { name: "Paolo Mostoles Alquizalas", personalEmail: "alquizalaspaolo32@gmail.com", micro1Email: "paal543@expert.micro1.ai" },
  { name: "Patience Maposa", personalEmail: "ppcmaposa@gmail.com", micro1Email: "pama506@expert.micro1.ai" },
  { name: "Patricio Rivera", personalEmail: "patogmp@gmail.com", micro1Email: "pari822@expert.micro1.ai" },
  { name: "Paweł Skuczyński", personalEmail: "pskuczynski02@gmail.com", micro1Email: "gx938@expert.micro1.ai" },
  { name: "Rameesa Mushtaq", personalEmail: "rmufti017@gmail.com", micro1Email: "ramu045@expert.micro1.ai" },
  { name: "Ranjini Janardhanan", personalEmail: "ranjini.janardhanan@gmail.com", micro1Email: "raja618@expert.micro1.ai" },
  { name: "Ravi Kiran Mattaparthi", personalEmail: "rkmattaparthi@outlook.com", micro1Email: "rama959@expert.micro1.ai" },
  { name: "Raymond Evaristo", personalEmail: "raymondmp.evaristo@gmail.com", micro1Email: "re499@expert.micro1.ai" },
  { name: "Robert Litt", personalEmail: "robert.litt@ousd.org", micro1Email: "rl503@expert.micro1.ai" },
  { name: "Roberto Zavala", personalEmail: "pavita.fineart@gmail.com", micro1Email: "rz422@expert.micro1.ai" },
  { name: "Rodrigo Meoño", personalEmail: "hello@uxrodrigo.com", micro1Email: "rome791@expert.micro1.ai" },
  { name: "Romell Jaganathan", personalEmail: "romellj06@gmail.com", micro1Email: "roja167@expert.micro1.ai" },
  { name: "Rousseau Pierre Louis", personalEmail: "architect.rosu@gmail.com", micro1Email: "gx945@expert.micro1.ai" },
  { name: "Sarah Dooley", personalEmail: "sarah.dooley@outlook.com", micro1Email: "sado465@expert.micro1.ai" },
  { name: "Sarah Greenlees", personalEmail: "sarah@genesis-learning.com", micro1Email: "sg601@expert.micro1.ai" },
  { name: "Sasha Ramsaw", personalEmail: "sasha@sasharamsawconsulting.com", micro1Email: "sr659@expert.micro1.ai" },
  { name: "Markus Saukkonen", personalEmail: "saukkonen@me.com", micro1Email: "masa566@expert.micro1.ai" },
  { name: "Sayooj Balakrishnan", personalEmail: "saicaptura@gmail.com", micro1Email: "saba049@expert.micro1.ai" },
  { name: "Shalton Ogola", personalEmail: "shalton.ogola@gmail.com", micro1Email: "shog124@expert.micro1.ai" },
  { name: "Shanna N'Diaye", personalEmail: "shannandiaye1@gmail.com", micro1Email: "shnd356@expert.micro1.ai" },
  { name: "shannin solie", personalEmail: "shannin.solie@gmail.com", micro1Email: "ss598@expert.micro1.ai" },
  { name: "Shaun Muir", personalEmail: "shaun.muirs@gmail.com", micro1Email: "gx860@expert.micro1.ai" },
  { name: "Sivaranjani Swaminathan", personalEmail: "sivaranjani1790@gmail.com", micro1Email: "ss564@expert.micro1.ai" },
  { name: "Smriti Shashikant NAIK", personalEmail: "smriti.naik@sciencespo.fr", micro1Email: "smna538@expert.micro1.ai" },
  { name: "Sodiq Adesina Damilare", personalEmail: "hademerotbiggieman@gmail.com", micro1Email: "soad928@expert.micro1.ai" },
  { name: "Sri Ram Soma", personalEmail: "sssriramsoma@gmail.com", micro1Email: "srso438@expert.micro1.ai" },
  { name: "Stephanie Hammerman", personalEmail: "stephanielande@gmail.com", micro1Email: "sh276@expert.micro1.ai" },
  { name: "Stephen Georgieff", personalEmail: "stephengeorgieff@gmail.com", micro1Email: "stge838@expert.micro1.ai" },
  { name: "Marina Suassuna", personalEmail: "suassunamarina@gmail.com", micro1Email: "masu584@expert.micro1.ai" },
  { name: "Suzanne Bertz", personalEmail: "suebertz03@gmail.com", micro1Email: "sb724@expert.micro1.ai" },
  { name: "Swati Bandhewal", personalEmail: "swati.bandhewal@gmail.com", micro1Email: "swba114@expert.micro1.ai" },
  { name: "Tai Massion", personalEmail: "tai.massion@gmail.com", micro1Email: "tm347@expert.micro1.ai" },
  { name: "Taita Iliya", personalEmail: "iliyataita@gmail.com", micro1Email: "tail825@expert.micro1.ai" },
  { name: "Tekla Obach", personalEmail: "obachachieng4@gmail.com", micro1Email: "teob485@expert.micro1.ai" },
  { name: "Theophilus Babalola", personalEmail: "theophilusadeyinkab@gmail.com", micro1Email: "thba294@expert.micro1.ai" },
  { name: "Tian Tian", personalEmail: "tian.jason.tian@gmail.com", micro1Email: "titi711@expert.micro1.ai" },
  { name: "Tijani Jimoh", personalEmail: "aaretijani01@gmail.com", micro1Email: "tiji984@expert.micro1.ai" },
  { name: "Tobi Otojare", personalEmail: "tobibanwo8@gmail.com", micro1Email: "olot386@expert.micro1.ai" },
  { name: "TRANG MARIONEAUX", personalEmail: "trangstar@gmail.com", micro1Email: "trma663@expert.micro1.ai" },
  { name: "Vianey Samanniego", personalEmail: "samaniego.artworks@gmail.com", micro1Email: "visa498@expert.micro1.ai" },
  { name: "Vibin George", personalEmail: "vibingeorge07@gmail.com", micro1Email: "gx1102@expert.micro1.ai" },
  { name: "Vijay Parmar", personalEmail: "vijay2911992@gmail.com", micro1Email: "gx867@expert.micro1.ai" },
  { name: "Vinícius Ferreira Galvão", personalEmail: "vinifgalvao1@hotmail.com", micro1Email: "vf354@expert.micro1.ai" },
  { name: "Vita Tria", personalEmail: "vitavianca@gmail.com", micro1Email: "vitr431@expert.micro1.ai" },
  { name: "Xavier Cabrera Vargas", personalEmail: "info@xavicabrera.com", micro1Email: "xaca272@expert.micro1.ai" },
  { name: "Xi Stacey Zhang", personalEmail: "xistaceyzhang@gmail.com", micro1Email: "xizh294@expert.micro1.ai" },
  { name: "Yash Navadiya", personalEmail: "yashnavadiya1212@gmail.com", micro1Email: "yana588@expert.micro1.ai" },
  { name: "Yonatan Eyob", personalEmail: "yonataneyobbb@gmail.com", micro1Email: "yoey028@expert.micro1.ai" },
  { name: "Thembelihle Zwane", personalEmail: "zwanembali59@gmail.com", micro1Email: "thzw677@expert.micro1.ai" },
  { name: "André Pereira", personalEmail: null, micro1Email: null },
  { name: "Alexandru Patache", personalEmail: null, micro1Email: null },
  { name: "Alison Maguina", personalEmail: null, micro1Email: null },
  { name: "Amarachi Nwokocha", personalEmail: null, micro1Email: null },
  { name: "Anshuman Nayak", personalEmail: null, micro1Email: null },
  { name: "Aaron Grommesh", personalEmail: null, micro1Email: null },
  { name: "Ahmed Abdelrazek", personalEmail: null, micro1Email: null },
  { name: "Damian Szymczak", personalEmail: null, micro1Email: null },
];

// ─────────────────────────────────────────────────────────────
// LOOKUP BUILDER
// ─────────────────────────────────────────────────────────────

function buildLookup() {
  const byName = new Map();
  const byEmail = new Map();

  for (const entry of MEMBER_DIRECTORY) {
    byName.set(entry.name.toLowerCase().trim(), entry);
    if (entry.personalEmail) {
      byEmail.set(entry.personalEmail.toLowerCase().trim(), entry);
    }
  }

  return { byName, byEmail };
}

function resolveEntry(hubstaffName, lookup) {
  const key = hubstaffName.toLowerCase().trim();
  return lookup.byName.get(key) || lookup.byEmail.get(key) || null;
}

// ─────────────────────────────────────────────────────────────
// FETCH ALL PAGES
// ─────────────────────────────────────────────────────────────

async function fetchAllMembers() {
  const allItems = [];
  let page = 1;
  let isLastPage = false;

  while (!isLastPage) {
    console.log(`  Fetching page ${page}…`);
    const body = { ...REQUEST_BODY, page };

    const response = await axios.post(MEMBERS_URL, body, {
      headers: REQUEST_HEADERS,
      responseType: "json",
    });

    const { items, pagination } = response.data;
    allItems.push(...items);

    isLastPage = pagination.last_page;
    page = pagination.next_page;
  }

  return allItems;
}

// ─────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("Fetching all Hubstaff members…");
  const items = await fetchAllMembers();
  console.log(`Fetched ${items.length} members total.`);

  const lookup = buildLookup();
  const unmatched = [];

  const ops = items.map(({ id, name }) => {
    const dir = resolveEntry(name, lookup);
    if (!dir) unmatched.push({ id, name });

    return {
      updateOne: {
        filter: { hubstaffId: id },
        update: {
          $set: {
            hubstaffId: id,
            hubstaffName: name,
            personalEmail: dir ? dir.personalEmail : null,
            micro1Email: dir ? dir.micro1Email : null,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    };
  });

  if (unmatched.length > 0) {
    console.warn(`\n⚠️  ${unmatched.length} member(s) not found in MEMBER_DIRECTORY (emails will be null):`);
    unmatched.forEach(({ id, name }) => console.warn(`   - [${id}] ${name}`));
  }

  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const collection = client.db(MONGO_DB).collection(MONGO_COLLECTION);

    await collection.createIndex({ hubstaffId: 1 }, { unique: true });

    const result = await collection.bulkWrite(ops, { ordered: false });
    console.log(
      `\n✅  MongoDB: ${result.upsertedCount} inserted, ${result.modifiedCount} updated (${MONGO_DB}.${MONGO_COLLECTION})`,
    );
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("❌  Error:", err.message);
  process.exit(1);
});
