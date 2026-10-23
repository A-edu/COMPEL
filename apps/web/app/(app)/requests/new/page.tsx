import { connection } from "next/server";
import { NewRequestForm } from "./new-request-form";

// §9. The upload limit is read at request time from the same MAX_UPLOAD_MB
// the API enforces, so the form can say so before uploading. If it is not
// set, only the API checks file sizes.
export default async function NewRequestPage() {
  await connection();
  const mb = Number(process.env.MAX_UPLOAD_MB);
  return (
    <NewRequestForm
      maxUploadMb={Number.isInteger(mb) && mb > 0 ? mb : undefined}
    />
  );
}
