/**
 * What a client review is.
 *
 * There is deliberately no bundled sample review here any more. The landing page used to append a
 * fabricated testimonial ("Aarav Sharma") to whatever the admin had actually published, which put
 * an invented endorsement on the page beside real ones — indistinguishable to a reader, and not
 * something a visitor should ever be shown. The section now renders published reviews only, and
 * hides itself when there are none.
 */
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
