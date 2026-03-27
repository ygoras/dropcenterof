-- Allow admins to see all notifications
CREATE POLICY "Admins can view all notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  );

-- Allow admins to update all notifications
CREATE POLICY "Admins can update all notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
  );
