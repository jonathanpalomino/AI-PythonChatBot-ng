import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewConversationModal } from './new-conversation-modal';

describe('NewConversationModal', () => {
  let component: NewConversationModal;
  let fixture: ComponentFixture<NewConversationModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewConversationModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewConversationModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
