import React, { useEffect, useState } from 'react';
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  getDoc,
  arrayUnion,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../server/api';
import ModalGrupo from './modalgrupos/modalgrupo';
import HorariosGrupo from './horariosgrupo/horariosgrupo';
import './grupos.css';

const formatDateTimeDisplay = (value) => {
  if (!value) return '';

  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const dateStr = new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);

  const timeStr = new Intl.DateTimeFormat('es-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);

  return `${dateStr} · ${timeStr}`;
};

const getMondayOfWeek = (date) => {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7;
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
};

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const Grupos = ({ user }) => {
  const [groups, setGroups] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [hiddenGroupIds, setHiddenGroupIds] = useState(null);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [activeGroup, setActiveGroup] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedParticipants, setExpandedParticipants] = useState({});
  const [viewingGroupSchedule, setViewingGroupSchedule] = useState(null);
  const [groupsLastUpdated, setGroupsLastUpdated] = useState({});
  const [leavingGroupIds, setLeavingGroupIds] = useState([]);

  useEffect(() => {
    if (!user) return;

    let isCurrentUser = true;
    const loadHiddenGroups = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        const hiddenIds = userDoc.exists() ? userDoc.data()?.hiddenGroupIds : [];
        if (isCurrentUser) {
          setHiddenGroupIds(Array.isArray(hiddenIds) ? hiddenIds : []);
        }
      } catch (error) {
        console.error('Error cargando grupos ocultos:', error);
        if (isCurrentUser) setHiddenGroupIds([]);
      }
    };

    setHiddenGroupIds(null);
    loadHiddenGroups();
    return () => {
      isCurrentUser = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const gruposRef = collection(db, 'grupos');

    const unsubscribe = onSnapshot(
      gruposRef,
      (snapshot) => {
        const loaded = snapshot.docs
          .map((groupDoc) => ({
            id: groupDoc.id,
            ...groupDoc.data(),
          }));

        setAllGroups(loaded);
        setLoadingGroups(false);
      },
      (error) => {
        console.error('Error cargando grupos:', error);
        setLoadingGroups(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (hiddenGroupIds === null) return;

    const normalizedEmail = user.email?.trim().toLowerCase();
    const visibleGroups = allGroups.filter((group) => {
      if (hiddenGroupIds.includes(group.id) || group.hiddenFor?.includes(user.uid)) return false;
      const belongsAsOwner = group.ownerId === user.uid;
      const belongsAsParticipant = group.participants?.some(
        (participant) =>
          participant.uid === user.uid
          || participant.email?.trim().toLowerCase() === normalizedEmail
      );
      return belongsAsOwner || belongsAsParticipant;
    });

    setGroups(visibleGroups);
  }, [allGroups, hiddenGroupIds, user]);

  // Cargar última actualización de horarios para cada grupo
  useEffect(() => {
    if (groups.length === 0) return;

    const loadLastUpdated = async () => {
      const updates = {};
      const currentWeekKey = formatDateInput(getMondayOfWeek(new Date()));

      for (const group of groups) {
        try {
          const ownerId = group.ownerId || group.id;
          const horariosRef = doc(db, 'HORARIOS_GRUPOS', `${ownerId}_${group.id}`);
          const horariosSnap = await getDoc(horariosRef);
          if (horariosSnap.exists()) {
            const data = horariosSnap.data();
            const currentWeek = data?.semanas?.[currentWeekKey];
            if (currentWeek?.updatedAt) {
              updates[group.id] = currentWeek.updatedAt;
            }
          }
        } catch (error) {
          console.error(`Error cargando última actualización del grupo ${group.id}:`, error);
        }
      }
      setGroupsLastUpdated(updates);
    };

    loadLastUpdated();
  }, [groups]);

  const openCreateModal = () => {
    setActiveGroup(null);
    setIsModalOpen(true);
  };

  const openEditModal = (group) => {
    setActiveGroup(group);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setActiveGroup(null);
    setIsModalOpen(false);
  };

  const toggleParticipants = (groupId) => {
    setExpandedParticipants((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const toggleCargoGroup = (groupId, cargoId) => {
    const key = `${groupId}-${cargoId}`;
    setExpandedParticipants((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isCargoExpanded = (groupId, cargoId) =>
    expandedParticipants[`${groupId}-${cargoId}`];

  const sortCargosByLevel = (cargos = []) =>
    [...cargos].sort((a, b) => (a.nivel || 0) - (b.nivel || 0));

  const getParticipantsByCargo = (participants = [], cargoId) =>
    participants.filter((participant) => participant.cargo === cargoId);

  const getUnassignedParticipants = (participants = []) =>
    participants.filter((participant) => !participant.cargo);

  const handleLeaveGroup = async (group) => {
    const confirmed = window.confirm(
      'El grupo y sus horarios seguirán disponibles para los demás integrantes. ¿Quieres dejar de verlo en tu cuenta?'
    );
    if (!confirmed) return;

    setLeavingGroupIds((current) => [...current, group.id]);
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, 'usuarios', user.uid),
        { hiddenGroupIds: arrayUnion(group.id) },
        { merge: true }
      );
      batch.update(doc(db, 'grupos', group.id), {
        hiddenFor: arrayUnion(user.uid),
      });
      await batch.commit();
      setHiddenGroupIds((current) => [...new Set([...(current || []), group.id])]);
    } catch (error) {
      console.error(`Error saliendo del grupo ${group.id}:`, error);
      window.alert('No se pudo salir del grupo. Inténtalo de nuevo.');
    } finally {
      setLeavingGroupIds((current) => current.filter((id) => id !== group.id));
    }
  };

  const handleSaveGroup = async (groupData) => {
  if (!user) return;

  if (!activeGroup && allGroups.some((group) => group.ownerId === user.uid)) {
    alert('Ya tienes un grupo creado.');
    return;
  }

  setIsSaving(true);

  const participantEmails = groupData.participants
    .map((participant) => participant.email?.toLowerCase())
    .filter(Boolean);

  const participantIds = groupData.participants
    .map((participant) => participant.uid)
    .filter(Boolean);

  const adminIds = [
    user.uid,
    ...groupData.participants
      .filter((participant) => participant.role === 'editor')
      .map((participant) => participant.uid)
      .filter(Boolean),
  ];

  const cleanSchedules = (groupData.schedules || []).map(schedule => ({
    day: schedule.day || '',
    start: schedule.start || '',
    end: schedule.end || '',
  }));

  try {
    if (activeGroup && activeGroup.id) {
      const groupDoc = doc(db, 'grupos', activeGroup.id);

      await updateDoc(groupDoc, {
        groupName: groupData.groupName,
        participants: groupData.participants,
        participantEmails,
        participantIds,
        adminIds,
        schedules: cleanSchedules,
        cargos: groupData.cargos || [],
      });

    } else {
      await setDoc(doc(db, 'grupos', user.uid), {
        ownerId: user.uid,
        groupName: groupData.groupName,
        participants: groupData.participants,
        participantEmails,
        participantIds,
        adminIds,
        schedules: cleanSchedules,
        cargos: groupData.cargos || [],
        createdAt: serverTimestamp(),
      });
    }

    closeModal();

  } catch (error) {
    console.error('===== ERROR COMPLETO =====');
    console.error(error);
  } finally {
    setIsSaving(false);
  }
};

  if (viewingGroupSchedule) {
    return (
      <HorariosGrupo
        group={viewingGroupSchedule}
        user={user}
        onBack={() => setViewingGroupSchedule(null)}
      />
    );
  }


  return (
    <div className="grupos-container">
      <h2>Grupo</h2>

      {/* 🔥 SOLO mostrar crear si NO hay grupo */}
      {!loadingGroups && groups.length === 0 && !allGroups.some((group) => group.ownerId === user.uid) && (
        <div className="grupos-list">
          <div className="grupo-card create-card" onClick={openCreateModal}>
            <h3>+ Crear grupo</h3>
            <p>Presiona aquí para crear tu grupo.</p>
          </div>
        </div>
      )}

      {loadingGroups || hiddenGroupIds === null ? (
        <div className="grupo-card info-card">Cargando grupo...</div>
      ) : groups.length === 0 ? (
        <div className="grupo-card info-card">
          {allGroups.some((group) => group.ownerId === user.uid) ? (
            <p>Saliste de tu grupo. Sus horarios ya no aparecerán en tu home y el grupo sigue disponible para los demás integrantes.</p>
          ) : (
            <>
              <p>No tienes grupo todavía.</p>
              <p>Crea uno para comenzar.</p>
            </>
          )}
        </div>
      ) : (
        <div className="grupos-list">
          {groups.map((group) => (
            <div key={group.id} className="grupo-card">
              <div className="grupo-header">
                <div>
                  <h3>{group.groupName || 'Grupo sin nombre'}</h3>
                  <p>
                    {group.participants?.length || 0} participante
                    {group.participants?.length === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="grupo-header-actions">
                  <button
                    className="edit-button"
                    onClick={() => openEditModal(group)}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="leave-group-button"
                    onClick={() => handleLeaveGroup(group)}
                    disabled={leavingGroupIds.includes(group.id)}
                  >
                    {leavingGroupIds.includes(group.id) ? 'Saliendo...' : 'Salir del grupo'}
                  </button>
                </div>
              </div>

              <div className="grupo-details">
                {group.participants?.length > 0 ? (
                  <div className="grupo-participants-section">
                    <button
                      type="button"
                      className="grupo-participants-toggle"
                      onClick={() => toggleParticipants(group.id)}
                    >
                      {expandedParticipants[group.id] ? '▼' : '▶'} {group.participants.length} participante{group.participants.length === 1 ? '' : 's'}
                    </button>
                    {expandedParticipants[group.id] && (
                      <div className="grupo-participants-list">
                        {group.cargos?.length > 0 ? (
                          <>
                            {sortCargosByLevel(group.cargos).map((cargo) => {
                              const cargoMembers = getParticipantsByCargo(group.participants, cargo.id);
                              return (
                                <div key={cargo.id} className="cargo-group">
                                  <button
                                    type="button"
                                    className="cargo-header-button"
                                    onClick={() => toggleCargoGroup(group.id, cargo.id)}
                                  >
                                    <div className="cargo-header-title">
                                      <strong>{cargo.nombre}</strong>
                                      <span className="cargo-level">Nivel {cargo.nivel}</span>
                                    </div>
                                    <div className="cargo-header-meta">
                                      <span>{cargoMembers.length} participante{cargoMembers.length === 1 ? '' : 's'}</span>
                                      <span className="cargo-toggle-icon">
                                        {isCargoExpanded(group.id, cargo.id) ? '▼' : '▶'}
                                      </span>
                                    </div>
                                  </button>
                                  {isCargoExpanded(group.id, cargo.id) && (
                                    <div className="cargo-members">
                                      {cargoMembers.length > 0 ? (
                                        cargoMembers.map((participant, index) => (
                                          <div key={`${participant.email}-${index}`} className="cargo-participant">
                                            <div>
                                              <strong>{participant.name}</strong>
                                              <span>{participant.email}</span>
                                            </div>
                                            <span className="group-participant-role">
                                              {participant.role === 'lector' ? 'Lector' : 'Editor'}
                                            </span>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="cargo-empty">No hay participantes en este cargo.</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}

                            {getUnassignedParticipants(group.participants).length > 0 && (
                              <div className="cargo-group unassigned-group">
                                <button
                                  type="button"
                                  className="cargo-header-button"
                                  onClick={() => toggleCargoGroup(group.id, 'sin-cargo')}
                                >
                                  <div className="cargo-header-title">
                                    <strong>Sin cargo</strong>
                                  </div>
                                  <div className="cargo-header-meta">
                                    <span>{getUnassignedParticipants(group.participants).length} participante{getUnassignedParticipants(group.participants).length === 1 ? '' : 's'}</span>
                                    <span className="cargo-toggle-icon">
                                      {isCargoExpanded(group.id, 'sin-cargo') ? '▼' : '▶'}
                                    </span>
                                  </div>
                                </button>
                                {isCargoExpanded(group.id, 'sin-cargo') && (
                                  <div className="cargo-members">
                                    {getUnassignedParticipants(group.participants).map((participant, index) => (
                                      <div key={`${participant.email}-sin-cargo-${index}`} className="cargo-participant">
                                        <div>
                                          <strong>{participant.name}</strong>
                                          <span>{participant.email}</span>
                                        </div>
                                        <span className="group-participant-role">
                                          {participant.role === 'lector' ? 'Lector' : 'Editor'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        ) : (
                          group.participants.map((participant, index) => (
                            <div key={`${participant.email}-${index}`} className="grupo-participant">
                              <div>
                                <strong>{participant.name}</strong>
                                <span>{participant.email}</span>
                              </div>
                              <span className="group-participant-role">
                                {participant.role === 'lector' ? 'Lector' : 'Editor'}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="grupo-empty">Sin participantes agregados.</p>
                )}

                {group.schedules?.length > 0 ? (
                  <div className="grupo-schedules">
                    {group.schedules.map((schedule, index) => (
                      <div key={`${schedule.day}-${index}`} className="grupo-schedule-row">
                        <span>{schedule.day}</span>
                        <span>
                          {schedule.startTime || '--:--'} - {schedule.endTime || '--:--'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : groupsLastUpdated[group.id] ? (
                  <p className="grupo-empty">
                    📅 Horarios cargados: {formatDateTimeDisplay(groupsLastUpdated[group.id])}
                  </p>
                ) : (
                  <p className="grupo-empty">No hay horarios definidos.</p>
                )}
              </div>

              <div className="grupo-actions">
                <button className="edit-button" onClick={() => openEditModal(group)}>
                  Editar datos
                </button>
                <button className="schedule-button" onClick={() => setViewingGroupSchedule(group)}>
                  Ver horarios
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ModalGrupo
        isOpen={isModalOpen}
        onClose={closeModal}
        onSave={handleSaveGroup}
        group={activeGroup}
        isSaving={isSaving}
      />
    </div>
  );
};

export default Grupos;