export type ClientReview = {
  id: string;
  name: string;
  location: string;
  role: string;
  photo: string;
  accent: string;
  comment: string;
  signature: string;
  signatureImage?: string | null;
  rating: number;
  createdAt?: string;
};

export const DEFAULT_CLIENT_REVIEWS: ClientReview[] = [
  {
    id: "default-aarav",
    name: "Aarav Sharma",
    location: "Pune",
    role: "Swing trader",
    photo: "https://i.pravatar.cc/240?img=12",
    accent: "from-rose-500 via-orange-300 to-amber-300",
    comment:
      "The daily top picks and dip screeners save me a lot of manual filtering. I still make the call, but Stockers gives me a sharper shortlist before market open.",
    signature: "Aarav",
    rating: 5,
  },
  {
    id: "default-neha",
    name: "Neha Iyer",
    location: "Bengaluru",
    role: "Long-term investor",
    photo: "https://i.pravatar.cc/240?img=47",
    accent: "from-emerald-500 via-teal-300 to-sky-300",
    comment:
      "I like that the dashboard separates exchange data from the AI view. It helps me read sector moves calmly instead of jumping between too many tabs.",
    signature: "Neha",
    rating: 5,
  },
  {
    id: "default-kabir",
    name: "Kabir Mehta",
    location: "Mumbai",
    role: "Portfolio tracker",
    photo: "https://i.pravatar.cc/240?img=53",
    accent: "from-sky-500 via-indigo-300 to-violet-300",
    comment:
      "The stock comparison panel is the feature I use most. It puts positives, risks and recent momentum in one place, which makes reviews faster.",
    signature: "Kabir",
    rating: 5,
  },
  {
    id: "default-priya",
    name: "Priya Nair",
    location: "Kochi",
    role: "ETF investor",
    photo: "https://i.pravatar.cc/240?img=32",
    accent: "from-fuchsia-500 via-rose-300 to-orange-300",
    comment:
      "The ETF board finally makes fund research feel organized. I can compare volumes, categories and AI notes without losing the bigger picture.",
    signature: "Priya",
    rating: 5,
  },
  {
    id: "default-rohan",
    name: "Rohan Desai",
    location: "Ahmedabad",
    role: "Active investor",
    photo: "https://i.pravatar.cc/240?img=15",
    accent: "from-cyan-500 via-blue-300 to-emerald-300",
    comment:
      "The market pulse gives me a quick read on breadth and tone. It is useful on volatile days when headlines alone do not explain the session.",
    signature: "Rohan",
    rating: 5,
  },
  {
    id: "default-meera",
    name: "Meera Kapoor",
    location: "Delhi NCR",
    role: "Dividend tracker",
    photo: "https://i.pravatar.cc/240?img=44",
    accent: "from-violet-500 via-purple-300 to-pink-300",
    comment:
      "Dividend and IPO tracking in the same workspace is practical. I can plan around dates and still keep an eye on the stocks moving today.",
    signature: "Meera",
    rating: 5,
  },
];
