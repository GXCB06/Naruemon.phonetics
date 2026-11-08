import { HomePath } from "@/components/home/HomePath";

// The shell is static. Progress and language come from localStorage, which only the client component reads
// (after hydration), so the first paint is the safe "no progress yet" path.
export default function Home() {
  return <HomePath />;
}
