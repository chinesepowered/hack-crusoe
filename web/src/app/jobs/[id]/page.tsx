import { notFound } from "next/navigation";
import { JobView } from "@/components/JobView";
import { getJob } from "@/engine/store";

export const dynamic = "force-dynamic";

export default async function JobPage(props: PageProps<"/jobs/[id]">) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  return <JobView initial={JSON.parse(JSON.stringify(job))} />;
}
