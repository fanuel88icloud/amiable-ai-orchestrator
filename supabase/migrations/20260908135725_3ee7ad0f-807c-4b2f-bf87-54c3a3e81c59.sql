CREATE POLICY "Creators can view organizations they created"
ON public.organizations
FOR SELECT
TO authenticated
USING (created_by = auth.uid());