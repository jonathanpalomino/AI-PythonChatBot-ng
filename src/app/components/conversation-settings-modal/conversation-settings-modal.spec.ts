import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConversationSettingsModal } from './conversation-settings-modal';

describe('ConversationSettingsModal', () => {
  let component: ConversationSettingsModal;
  let fixture: ComponentFixture<ConversationSettingsModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConversationSettingsModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConversationSettingsModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
