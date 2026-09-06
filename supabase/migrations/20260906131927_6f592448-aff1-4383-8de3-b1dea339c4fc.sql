REVOKE EXECUTE ON FUNCTION public.publish_agent(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_agent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_agent(uuid) TO authenticated;