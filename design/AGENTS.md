<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## CRM architecture
- Keep CRM sections as separate TanStack leaf routes sharing the CRM shell and semantic UI controls, so navigation and visual consistency remain centralized.
- Keep this reference-design implementation frontend-only with in-memory interactions until persistent functionality is requested, so design work does not introduce an unrequested backend.
