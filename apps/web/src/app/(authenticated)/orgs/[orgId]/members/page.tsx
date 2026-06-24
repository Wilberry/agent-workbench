import Link from 'next/link';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import type { Database } from '@/types/database';
import { createServerComponentSupabaseClient } from '@supabase/auth-helpers-nextjs';
import { canAssignRole, orgs } from '@agent-workbench/sdk';
import type { OrganizationMembership } from '@agent-workbench/sdk';

const validRoles = ['owner', 'admin', 'member', 'viewer'] as const;
type OrgMembershipRole = (typeof validRoles)[number];

async function assertManagerRole(orgId: string, userId: string, supabase: any) {
  const membership = await orgs.getMembership(orgId, userId, supabase);
  if (!membership) throw new Error('Not authorized');
  if (membership.role !== 'owner' && membership.role !== 'admin') throw new Error('Insufficient permissions');
  return membership;
}

async function addOrgMember(formData: FormData) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const name = formData.get('orgId')?.toString();
  const userId = formData.get('userId')?.toString();
  const role = formData.get('role')?.toString();

  if (!name || !userId || !role) {
    throw new Error('Organization, user ID, and role are required');
  }

  if (!validRoles.includes(role as OrgMembershipRole)) {
    throw new Error(`Role must be one of: ${validRoles.join(', ')}`);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const currentMembership = await assertManagerRole(name, user.id, supabase);
  if (!canAssignRole(currentMembership.role, role as OrgMembershipRole)) {
    throw new Error('Insufficient permissions to assign that role');
  }

  await orgs.addOrgMember(name, userId, role as OrgMembershipRole, supabase);
  redirect(`/orgs/${name}/members?success=added`);
}

async function updateMemberRole(formData: FormData) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const orgId = formData.get('orgId')?.toString();
  const membershipId = formData.get('membershipId')?.toString();
  const role = formData.get('role')?.toString();

  if (!orgId || !membershipId || !role) {
    throw new Error('Organization, membership, and role are required');
  }

  if (!validRoles.includes(role as OrgMembershipRole)) {
    throw new Error(`Role must be one of: ${validRoles.join(', ')}`);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const currentMembership = await assertManagerRole(orgId, user.id, supabase);
  const targetMembership = await orgs.getMembershipById(membershipId, supabase);

  if (!targetMembership || targetMembership.org_id !== orgId) {
    throw new Error('Membership not found');
  }

  if (!canAssignRole(currentMembership.role, role as OrgMembershipRole)) {
    throw new Error('Insufficient permissions to assign that role');
  }

  if (targetMembership.role === 'owner' && currentMembership.role !== 'owner') {
    throw new Error('Only owners can modify owner memberships');
  }

  await orgs.updateOrgMembership(membershipId, role as OrgMembershipRole, supabase);
  redirect(`/orgs/${orgId}/members?success=updated`);
}

async function removeOrgMember(formData: FormData) {
  'use server';

  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const orgId = formData.get('orgId')?.toString();
  const membershipId = formData.get('membershipId')?.toString();

  if (!orgId || !membershipId) {
    throw new Error('Organization and membership are required');
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const currentMembership = await assertManagerRole(orgId, user.id, supabase);
  const targetMembership = await orgs.getMembershipById(membershipId, supabase);

  if (!targetMembership || targetMembership.org_id !== orgId) {
    throw new Error('Membership not found');
  }

  if (targetMembership.role === 'owner' && currentMembership.role !== 'owner') {
    throw new Error('Only owners can remove owner memberships');
  }

  await orgs.removeOrgMembership(membershipId, supabase);
  redirect(`/orgs/${orgId}/members?success=removed`);
}

export default async function OrgMembersPage({ params }: { params: { orgId: string } }) {
  const supabase = createServerComponentSupabaseClient<Database>({ headers, cookies });
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Not authenticated.</div>;
  }

  const [org, memberships] = await Promise.all([
    orgs.getOrg(params.orgId, supabase),
    orgs.listOrgMemberships(params.orgId, supabase)
  ]);

  if (!org) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Organization not found.</div>;
  }

  const currentMembership = await orgs.getMembership(params.orgId, user.id, supabase);
  if (!currentMembership) {
    return <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 text-red-400">Not authorized to view members.</div>;
  }

  const canManageOrg = currentMembership.role === 'owner' || currentMembership.role === 'admin';

  return (
    <main className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-semibold">Organization members</h1>
              <p className="mt-2 text-slate-400">Manage who can access this organization and assign roles.</p>
            </div>
            <Link
              href={`/orgs/${org.id}/agents`}
              className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-emerald-500"
            >
              Back to org
            </Link>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6 lg:col-span-2">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Members</h2>
                <p className="mt-1 text-slate-400">Current organization membership and roles.</p>
              </div>
              <div className="rounded-3xl bg-slate-950 px-4 py-2 text-sm text-slate-200">
                Your role: {currentMembership.role}
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {memberships.length === 0 ? (
                <div className="rounded-3xl border border-slate-700 bg-slate-950 p-6 text-slate-400">No organization members found.</div>
              ) : (
                memberships.map((member: OrganizationMembership) => (
                  <div key={member.id} className="rounded-3xl border border-slate-700 bg-slate-950 p-4 sm:flex sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm text-slate-400">Member ID</div>
                      <div className="mt-1 text-white break-all">{member.user_id}</div>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:mt-0 sm:flex-row sm:items-center">
                      <div className="rounded-2xl bg-slate-900 px-4 py-2 text-sm text-slate-200">{member.role}</div>
                      {canManageOrg ? (
                        <form action={updateMemberRole} className="flex flex-wrap gap-2 items-center" method="post">
                          <input type="hidden" name="orgId" value={params.orgId} />
                          <input type="hidden" name="membershipId" value={member.id} />
                          <select
                            name="role"
                            defaultValue={member.role}
                            className="rounded-2xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                          >
                            {validRoles.map((role) => (
                              <option key={role} value={role}>{role}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="rounded-2xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                          >
                            Update
                          </button>
                        </form>
                      ) : null}
                      {canManageOrg ? (
                        <form action={removeOrgMember} method="post">
                          <input type="hidden" name="orgId" value={params.orgId} />
                          <input type="hidden" name="membershipId" value={member.id} />
                          <button
                            type="submit"
                            className="rounded-2xl border border-rose-500 bg-rose-950 px-3 py-2 text-sm font-semibold text-rose-300 hover:bg-rose-900"
                          >
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-700 bg-slate-900 p-6">
            <h2 className="text-2xl font-semibold">Invite member</h2>
            <p className="mt-1 text-slate-400">Add a member by user ID and choose a role.</p>

            {canManageOrg ? (
              <form action={addOrgMember} className="mt-6 space-y-4" method="post">
                <input type="hidden" name="orgId" value={params.orgId} />
                <div>
                  <label className="block text-sm font-semibold text-slate-200">User ID</label>
                  <input
                    name="userId"
                    required
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
                    placeholder="user-id"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-200">Role</label>
                  <select
                    name="role"
                    defaultValue="member"
                    className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500"
                  >
                    {validRoles.map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Add member
                </button>
              </form>
            ) : (
              <div className="mt-6 rounded-3xl border border-slate-700 bg-slate-950 p-4 text-slate-400">
                Only owners or admins can add or manage members.
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
