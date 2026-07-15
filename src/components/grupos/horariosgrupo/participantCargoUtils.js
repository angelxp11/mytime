export const buildGroupParticipantUpdatePayload = (
  participants,
  participantIndex,
  selectedCargoId,
  groupName,
  cargos = []
) => {
  const participantEmails = (participants || [])
    .map((participant) => participant.email?.toLowerCase())
    .filter(Boolean);

  const participantIds = (participants || [])
    .map((participant) => participant.uid)
    .filter(Boolean);

  const updatedParticipants = (participants || []).map((participant, index) =>
    index === participantIndex
      ? { ...participant, cargo: selectedCargoId || null }
      : participant
  );

  return {
    groupName: groupName?.trim() || '',
    participants: updatedParticipants,
    participantEmails,
    participantIds,
    cargos,
  };
};
