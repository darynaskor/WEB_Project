import React from 'react';
import TaskHistory from '../TaskHistory.jsx';
import Toolbar from './Toolbar.jsx';
import TopControls from './TopControls.jsx';
import ProcessingPanel from './ProcessingPanel.jsx';
import ImageWorkspace from './ImageWorkspace.jsx';

function AppLayout({ toolbar, topControls, processing, taskHistory, workspace }) {
  return (
    <>
      <Toolbar {...toolbar} />
      <TopControls {...topControls} />
      <ProcessingPanel {...processing} />
      <TaskHistory {...taskHistory} />
      <ImageWorkspace {...workspace} />
    </>
  );
}

export default AppLayout;
