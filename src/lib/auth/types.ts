export interface CurrentUser {
  id: string;
  role: "complainant" | "advocate" | "staff" | "admin" | "commissioner";
  phone: string | null;
  full_name?: string | null;
  office?: string | null;
}
