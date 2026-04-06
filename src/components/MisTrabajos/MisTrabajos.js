import React from 'react';
import '../../colors.css';
import './MisTrabajos.css';

const MisTrabajos = () => {
  // Mock data for jobs
  const jobs = [
    { id: 1, title: 'Trabajo 1', status: 'En progreso', date: '2023-10-01' },
    { id: 2, title: 'Trabajo 2', status: 'Completado', date: '2023-09-15' },
    { id: 3, title: 'Trabajo 3', status: 'Pendiente', date: '2023-10-05' },
  ];

  return (
    <div className="trabajos-container">
      <h2>Mis Trabajos</h2>
      <div className="trabajos-list">
        {jobs.map(job => (
          <div key={job.id} className="trabajo-card">
            <h3>{job.title}</h3>
            <p>Estado: {job.status}</p>
            <p>Fecha: {job.date}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MisTrabajos;