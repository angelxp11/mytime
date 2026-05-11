import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../server/api';
import ModalGrupo from './modalgrupos/modalgrupo';
import HorariosGrupo from './horariosgrupo/horariosgrupo';
import './grupos.css';

const Grupos = ({ user }) => {
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [activeGroup, setActiveGroup] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedParticipants, setExpandedParticipants] = useState({});
  const [viewingGroupSchedule, setViewingGroupSchedule] = useState(null);

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
          }))
          .filter((group) => {
            const belongsAsOwner = group.ownerId === user.uid;
            const email = user.email?.toLowerCase();
            const belongsAsParticipant = group.participants?.some(
              (participant) => participant.email?.toLowerCase() === email
            );
            return belongsAsOwner || belongsAsParticipant;
          });

        setGroups(loaded);
        setLoadingGroups(false);
      },
      (error) => {
        console.error('Error cargando grupos:', error);
        setLoadingGroups(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

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

  const handleSaveGroup = async (groupData) => {
    if (!user) return;

    if (!activeGroup && groups.length > 0) {
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

    try {
      if (activeGroup && activeGroup.id) {
        const groupDoc = doc(db, 'grupos', activeGroup.id);
        await updateDoc(groupDoc, {
          groupName: groupData.groupName,
          participants: groupData.participants,
          participantEmails,
          participantIds,
          schedules: groupData.schedules,
        });
      } else {
        await setDoc(doc(db, 'grupos', user.uid), {
          ownerId: user.uid,
          groupName: groupData.groupName,
          participants: groupData.participants,
          participantEmails,
          participantIds,
          schedules: groupData.schedules,
          createdAt: serverTimestamp(),
        });
      }

      closeModal();
    } catch (error) {
      console.error('Error guardando grupo:', error);
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
      {!loadingGroups && groups.length === 0 && (
        <div className="grupos-list">
          <div className="grupo-card create-card" onClick={openCreateModal}>
            <h3>+ Crear grupo</h3>
            <p>Presiona aquí para crear tu grupo.</p>
          </div>
        </div>
      )}

      {loadingGroups ? (
        <div className="grupo-card info-card">Cargando grupo...</div>
      ) : groups.length === 0 ? (
        <div className="grupo-card info-card">
          <p>No tienes grupo todavía.</p>
          <p>Crea uno para comenzar.</p>
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
                <button
                  className="edit-button"
                  onClick={() => openEditModal(group)}
                >
                  Editar
                </button>
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
                        {group.participants.map((participant, index) => (
                          <div key={`${participant.email}-${index}`} className="grupo-participant">
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