import type { WorkOption } from "@/lib/supervisors/queries";

/** A work picker's options: opened from a stage, that stage's works come first; then every work by category. */
export function WorkOptions({
  works,
  stageWorkIds = [],
}: {
  works: WorkOption[];
  stageWorkIds?: string[];
}) {
  const stage = new Set(stageWorkIds);
  const first = works.filter((work) => stage.has(work.id));
  const categories = [...new Set(works.map((work) => work.categoryName))];
  return (
    <>
      <option value="" disabled>
        Pick the work…
      </option>
      {first.length > 0 && (
        <optgroup label="This stage">
          {first.map((work) => (
            <option key={work.id} value={work.id}>
              {work.label}
            </option>
          ))}
        </optgroup>
      )}
      {categories.map((category) => (
        <optgroup key={category} label={category}>
          {works
            .filter((work) => work.categoryName === category && !stage.has(work.id))
            .map((work) => (
              <option key={work.id} value={work.id}>
                {work.label}
              </option>
            ))}
        </optgroup>
      ))}
    </>
  );
}
