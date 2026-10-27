@AGENTS.md

# Releasing (same process as UduthiPaar, agreed with the owner)

Claude does the git steps; the owner only approves builds in GCP and checks the result.

1. Work on the Claude branch. When a change is ready, merge it into `uat`
   (`git fetch origin && git checkout -B uat origin/uat && git merge origin/<branch>`)
   and push `uat`. GCP Cloud Build then waits for the owner to approve the UAT build.
2. Tell the owner what to check on UAT. Wait.
3. Only when the owner says UAT is good: open a pull request into `main` and
   squash-merge it. Production has NO approval step: any push or merge to `main`
   deploys to production straight away. So nothing reaches `main` without the
   owner's explicit go-ahead for that change.
4. Afterwards merge `main` back into the Claude branch and push it. Do NOT push `uat`
   separately for this (it would start a UAT build with no changes). Changes never go
   from `uat` to `main` directly.

Database migrations go to the UAT database first, then production, before the code that
needs them. Never deploy with `gcloud builds submit`; both environments build from
their branch triggers.

# Things to keep in step with UduthiPaar

`lib/garments.ts` copies UduthiPaar's garment rules (garment-ai-saas
`lib/ai/garmentPromptProfile.ts`). When a rule is improved in one app, copy it to the other.
