import React, { useState } from 'react'
import { BlockNavigation, Link } from 'react-space-router'

export default function Blocking() {
  const [savedValue, setSavedValue] = useState('A small, focused router.')
  const [value, setValue] = useState(savedValue)
  const dirty = value !== savedValue

  return (
    <>
      <div className='mode-header'>
        <h1>Navigation Blocking</h1>
        <p>
          Edit the field, then follow a link or use browser Back. The attempted navigation is retained until you discard
          the change or stay on this page.
        </p>
      </div>

      <div className='recipe'>
        Recipe: render <code>&lt;BlockNavigation&gt;</code> only while the form is dirty. Its render function appears on
        demand and receives just <code>proceed()</code> and <code>cancel()</code>.
      </div>

      <div className='card blocking-form'>
        <label htmlFor='blocking-note'>Project note</label>
        <textarea id='blocking-note' value={value} onChange={(event) => setValue(event.currentTarget.value)} rows={5} />
        <div className='form-actions'>
          <span className={`form-status${dirty ? ' is-dirty' : ''}`}>{dirty ? 'Unsaved changes' : 'Saved'}</span>
          <button
            type='button'
            className='button button-primary'
            disabled={!dirty}
            onClick={() => setSavedValue(value)}
          >
            Save
          </button>
          <Link href='/' className='button'>
            Go to overview
          </Link>
        </div>
      </div>

      <p className='note'>Reloading or closing the tab while dirty uses the browser-owned confirmation dialog.</p>

      {dirty && (
        <BlockNavigation>
          {({ proceed, cancel }) => (
            <div className='dialog-backdrop'>
              <div role='dialog' aria-modal='true' aria-labelledby='discard-dialog-title' className='dialog-card'>
                <h2 id='discard-dialog-title'>Discard unsaved changes?</h2>
                <p>Your project note has not been saved.</p>
                <div className='dialog-actions'>
                  <button type='button' className='button' onClick={cancel}>
                    Stay here
                  </button>
                  <button type='button' className='button button-primary' onClick={proceed}>
                    Discard and leave
                  </button>
                </div>
              </div>
            </div>
          )}
        </BlockNavigation>
      )}
    </>
  )
}
