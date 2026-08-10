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
];
